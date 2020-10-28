# Copyright 2018-2020 Streamlit Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""st.caching unit tests."""
import threading
import unittest
import pytest
import types

from mock import patch

from streamlit import caching
from streamlit import hashing
from streamlit.hashing import UserHashError
from streamlit.elements import exception_proto
from streamlit.proto.Exception_pb2 import Exception as ExceptionProto
from tests import testutil
import streamlit as st


class CacheTest(testutil.DeltaGeneratorTestCase):
    def tearDown(self):
        # Some of these tests reach directly into _cache_info and twiddle it.
        # Reset default values on teardown.
        st.caching._cache_info.cached_func_stack = []
        st.caching._cache_info.suppress_st_function_warning = 0

    def test_simple(self):
        @st.cache
        def foo():
            return 42

        self.assertEqual(foo(), 42)
        self.assertEqual(foo(), 42)

    @patch.object(st, "exception")
    def test_args(self, exception):
        called = [False]

        @st.cache
        def f(x):
            called[0] = True
            return x

        self.assertFalse(called[0])
        f(0)

        self.assertTrue(called[0])

        called = [False]  # Reset called

        f(0)
        self.assertFalse(called[0])

        f(1)
        self.assertTrue(called[0])

        exception.assert_not_called()

    @patch.object(st, "exception")
    def test_mutate_return(self, exception):
        @st.cache
        def f():
            return [0, 1]

        r = f()

        r[0] = 1

        exception.assert_not_called()

        r2 = f()

        exception.assert_called()

        self.assertEqual(r, r2)

    @patch.object(st, "exception")
    def test_mutate_args(self, exception):
        @st.cache
        def foo(d):
            d["answer"] += 1
            return d["answer"]

        d = {"answer": 0}

        self.assertNotEqual(foo(d), foo(d))

        exception.assert_not_called()

    @patch("streamlit.caching._show_cached_st_function_warning")
    def test_cached_st_function_warning(self, warning):
        st.text("foo")
        warning.assert_not_called()

        @st.cache
        def cached_func():
            st.text("Inside cached func")

        cached_func()
        warning.assert_called_once()

        warning.reset_mock()

        # Make sure everything got reset properly
        st.text("foo")
        warning.assert_not_called()

        # Test warning suppression
        @st.cache(suppress_st_warning=True)
        def suppressed_cached_func():
            st.text("No warnings here!")

        suppressed_cached_func()

        warning.assert_not_called()

        # Test nested st.cache functions
        @st.cache
        def outer():
            @st.cache
            def inner():
                st.text("Inside nested cached func")

            return inner()

        outer()
        warning.assert_called_once()

        warning.reset_mock()

        # Test st.cache functions that raise errors
        with self.assertRaises(RuntimeError):

            @st.cache
            def cached_raise_error():
                st.text("About to throw")
                raise RuntimeError("avast!")

            cached_raise_error()

        warning.assert_called_once()
        warning.reset_mock()

        # Make sure everything got reset properly
        st.text("foo")
        warning.assert_not_called()

        # Test st.cache functions with widgets
        @st.cache
        def cached_widget():
            st.button("Press me!")

        cached_widget()

        warning.assert_called_once()
        warning.reset_mock()

        # Make sure everything got reset properly
        st.text("foo")
        warning.assert_not_called()

    def test_multithread_stack(self):
        """Test that cached_func_stack behaves properly in multiple threads."""

        def get_counter():
            return len(caching._cache_info.cached_func_stack)

        def set_counter(val):
            caching._cache_info.cached_func_stack = ["foo"] * val

        self.assertEqual(0, get_counter())
        set_counter(1)
        self.assertEqual(1, get_counter())

        values_in_thread = []

        def thread_test():
            values_in_thread.append(get_counter())
            set_counter(55)
            values_in_thread.append(get_counter())

        thread = threading.Thread(target=thread_test)
        thread.start()
        thread.join()

        self.assertEqual([0, 55], values_in_thread)

        # The other thread should not have modified the main thread
        self.assertEqual(1, get_counter())

    def test_max_size(self):
        """The oldest object should be evicted when maxsize is reached."""
        # Create 2 cached functions to test that they don't interfere
        # with each other.

        foo_vals = []

        @st.cache(max_entries=2)
        def foo(x):
            foo_vals.append(x)
            return x

        bar_vals = []

        @st.cache(max_entries=3)
        def bar(x):
            bar_vals.append(x)
            return x

        self.assertEqual([], foo_vals)
        self.assertEqual([], bar_vals)

        # Stick two items in both caches. foo will be filled.
        foo(0), foo(1)
        bar(0), bar(1)
        self.assertEqual([0, 1], foo_vals)
        self.assertEqual([0, 1], bar_vals)

        # 0, 1 are already cached, so called_values shouldn't change.
        foo(0), foo(1)
        bar(0), bar(1)
        self.assertEqual([0, 1], foo_vals)
        self.assertEqual([0, 1], bar_vals)

        # Add a new item to the cache.
        # foo: 0 should be evicted; 1 and 2 should be present.
        # bar: 0, 1, 2 present.
        foo(2)
        bar(2)

        # foo(0) again should cause 0 to be added again, since it was
        # previously evicted. Nothing will have been evicted from bar.
        foo(1), foo(0)
        bar(1), bar(0)
        self.assertEqual([0, 1, 2, 0], foo_vals)
        self.assertEqual([0, 1, 2], bar_vals)

    # Reduce the huge amount of logspam we get from hashing/caching
    @patch("streamlit.hashing._LOGGER.debug")
    @patch("streamlit.caching._LOGGER.debug")
    def test_no_max_size(self, _1, _2):
        """If max_size is None, the cache is unbounded."""
        called_values = []

        @st.cache(max_entries=None)
        def f(x):
            called_values.append(x)
            return x

        # Stick a bunch of items in the cache.
        for ii in range(256):
            f(ii)

        # Clear called_values, and test that accessing the same bunch of
        # items doesn't result in f() being called.
        called_values = []
        for ii in range(256):
            f(ii)
        self.assertEqual([], called_values)

    @patch("streamlit.caching._TTLCACHE_TIMER")
    def test_ttl(self, timer_patch):
        """Entries should expire after the given ttl."""
        # Create 2 cached functions to test that they don't interfere
        # with each other.
        foo_vals = []

        @st.cache(ttl=1)
        def foo(x):
            foo_vals.append(x)
            return x

        bar_vals = []

        @st.cache(ttl=5)
        def bar(x):
            bar_vals.append(x)
            return x

        # Store a value at time 0
        timer_patch.return_value = 0
        foo(0)
        bar(0)
        self.assertEqual([0], foo_vals)
        self.assertEqual([0], bar_vals)

        # Advance our timer, but not enough to expire our value.
        timer_patch.return_value = 0.5
        foo(0)
        bar(0)
        self.assertEqual([0], foo_vals)
        self.assertEqual([0], bar_vals)

        # Advance our timer enough to expire foo, but not bar.
        timer_patch.return_value = 1.5
        foo(0)
        bar(0)
        self.assertEqual([0, 0], foo_vals)
        self.assertEqual([0], bar_vals)

    def test_clear_cache(self):
        """Clear cache should do its thing."""
        foo_vals = []

        @st.cache
        def foo(x):
            foo_vals.append(x)
            return x

        bar_vals = []

        @st.cache
        def bar(x):
            bar_vals.append(x)
            return x

        foo(0), foo(1), foo(2)
        bar(0), bar(1), bar(2)
        self.assertEqual([0, 1, 2], foo_vals)
        self.assertEqual([0, 1, 2], bar_vals)

        # Clear the cache and access our original values again. They
        # should be recomputed.
        caching.clear_cache()

        foo(0), foo(1), foo(2)
        bar(0), bar(1), bar(2)
        self.assertEqual([0, 1, 2, 0, 1, 2], foo_vals)
        self.assertEqual([0, 1, 2, 0, 1, 2], bar_vals)


# Temporarily turn off these tests since there's no Cache object in __init__
# right now.
class CachingObjectTest(unittest.TestCase):
    def off_test_simple(self):
        val = 42

        for _ in range(2):
            c = st.Cache()
            if c:
                c.value = val

            self.assertEqual(c.value, val)

    def off_test_allow_output_mutation(self):
        val = 42

        for _ in range(2):
            c = st.Cache(allow_output_mutation=True)
            if c:
                c.value = val

            self.assertEqual(c.value, val)

    def off_test_has_changes(self):
        val = 42

        for _ in range(2):
            c = st.Cache()
            if c.has_changes():
                c.value = val

            self.assertEqual(c.value, val)

    @patch.object(st, "exception")
    def off_test_mutate(self, exception):
        for _ in range(2):
            c = st.Cache()
            if c:
                c.value = [0, 1]

            c.value[0] = 1

        exception.assert_called()


class CacheErrorsTest(testutil.DeltaGeneratorTestCase):
    """Make sure user-visible error messages look correct.

    These errors are a little annoying to test, but they're important! So we
    are testing them word-for-word as much as possible. Even though this
    *feels* like an antipattern, it isn't: we're making sure the codepaths
    that pull useful debug info from the code are working.
    """

    def test_st_warning_text(self):
        @st.cache
        def st_warning_text_func():
            st.markdown("hi")

        st_warning_text_func()

        el = self.get_delta_from_queue(-2).new_element
        self.assertEqual(el.exception.type, "CachedStFunctionWarning")
        self.assertEqual(
            normalize_md(el.exception.message),
            normalize_md(
                """
Your script uses `st.markdown()` or `st.write()` to write to your Streamlit app
from within some cached code at `st_warning_text_func()`. This code will only be
called when we detect a cache "miss", which can lead to unexpected results.

How to fix this:
* Move the `st.markdown()` or `st.write()` call outside `st_warning_text_func()`.
* Or, if you know what you're doing, use `@st.cache(suppress_st_warning=True)`
to suppress the warning.
        """
            ),
        )
        self.assertNotEqual(len(el.exception.stack_trace), 0)
        self.assertEqual(el.exception.message_is_markdown, True)
        self.assertEqual(el.exception.is_warning, True)

        el = self.get_delta_from_queue(-1).new_element
        self.assertEqual(el.markdown.body, "hi")

    def test_mutation_warning_text(self):
        @st.cache
        def mutation_warning_func():
            return []

        a = mutation_warning_func()
        a.append("mutated!")
        mutation_warning_func()

        el = self.get_delta_from_queue(-1).new_element
        self.assertEqual(el.exception.type, "CachedObjectMutationWarning")

        self.assertEqual(
            normalize_md(el.exception.message),
            normalize_md(
                """
Return value of `mutation_warning_func()` was mutated between runs.

By default, Streamlit\'s cache should be treated as immutable, or it may behave
in unexpected ways. You received this warning because Streamlit detected that
an object returned by `mutation_warning_func()` was mutated outside of
`mutation_warning_func()`.

How to fix this:
* If you did not mean to mutate that return value:
  - If possible, inspect your code to find and remove that mutation.
  - Otherwise, you could also clone the returned value so you can freely
    mutate it.
* If you actually meant to mutate the return value and know the consequences of
doing so, just annotate the function with `@st.cache(allow_output_mutation=True)`.

For more information and detailed solutions check out [our
documentation.](https://docs.streamlit.io/en/latest/advanced_caching.html)
            """
            ),
        )
        self.assertNotEqual(len(el.exception.stack_trace), 0)
        self.assertEqual(el.exception.message_is_markdown, True)
        self.assertEqual(el.exception.is_warning, True)

    def test_unhashable_type(self):
        @st.cache
        def unhashable_type_func():
            return threading.Lock()

        with self.assertRaises(hashing.UnhashableTypeError) as cm:
            unhashable_type_func()

        ep = ExceptionProto()
        exception_proto.marshall(ep, cm.exception)

        self.assertEqual(ep.type, "UnhashableTypeError")

        self.assertTrue(
            normalize_md(ep.message).startswith(
                normalize_md(
                    """
Cannot hash object of type `_thread.lock`, found in the return value of
`unhashable_type_func()`.

While caching the return value of `unhashable_type_func()`, Streamlit
encountered an object of type `_thread.lock`, which it does not know how to
hash.

To address this, please try helping Streamlit understand how to hash that type
by passing the `hash_funcs` argument into `@st.cache`. For example:

```
@st.cache(hash_funcs={_thread.lock: my_hash_func})
def my_func(...):
    ...
```

If you don't know where the object of type `_thread.lock` is coming
from, try looking at the hash chain below for an object that you do recognize,
then pass that to `hash_funcs` instead:

```
Object of type _thread.lock:
                    """
                )
            )
        )

        # Stack trace doesn't show in test :(
        # self.assertNotEqual(len(ep.stack_trace), 0)
        self.assertEqual(ep.message_is_markdown, True)
        self.assertEqual(ep.is_warning, False)

    def test_hash_funcs_acceptable_keys(self):
        @st.cache
        def unhashable_type_func():
            return (x for x in range(1))

        @st.cache(hash_funcs={types.GeneratorType: id})
        def hf_key_as_type():
            return (x for x in range(1))

        @st.cache(hash_funcs={"builtins.generator": id})
        def hf_key_as_str():
            return (x for x in range(1))

        with self.assertRaises(hashing.UnhashableTypeError) as cm:
            unhashable_type_func()

        self.assertEqual(list(hf_key_as_type()), list(hf_key_as_str()))

    def test_user_hash_error(self):
        class MyObj(object):
            pass

        def bad_hash_func(x):
            x += 10  # Throws a TypeError since x has type MyObj.
            return x

        @st.cache(hash_funcs={MyObj: bad_hash_func})
        def user_hash_error_func(x):
            pass

        with self.assertRaises(hashing.UserHashError) as cm:
            my_obj = MyObj()
            user_hash_error_func(my_obj)

        ep = ExceptionProto()
        exception_proto.marshall(ep, cm.exception)

        self.assertEqual(ep.type, "TypeError")
        self.assertTrue(
            normalize_md(ep.message).startswith(
                normalize_md(
                    """
unsupported operand type(s) for +=: 'MyObj' and 'int'

This error is likely due to a bug in `bad_hash_func()`, which is a
user-defined hash function that was passed into the `@st.cache` decorator of
`user_hash_error_func()`.

`bad_hash_func()` failed when hashing an object of type
`caching_test.CacheErrorsTest.test_user_hash_error.<locals>.MyObj`.  If you
don't know where that object is coming from, try looking at the hash chain
below for an object that you do recognize, then pass that to `hash_funcs` instead:

```
Object of type caching_test.CacheErrorsTest.test_user_hash_error.<locals>.MyObj:
<caching_test.CacheErrorsTest.test_user_hash_error.<locals>.MyObj object at
        """
                )
            )
        )

        # Stack trace doesn't show in test :(
        # self.assertNotEqual(len(ep.stack_trace), 0)
        self.assertEqual(ep.message_is_markdown, True)
        self.assertEqual(ep.is_warning, False)


def normalize_md(txt):
    """Replace newlines *inside paragraphs* with spaces.

    Consecutive lines of text are considered part of the same paragraph
    in Markdown. So this function joins those into a single line to make the
    test robust to changes in text wrapping.

    NOTE: This function doesn't attempt to be 100% grammatically correct
    Markdown! It's just supposed to be "correct enough" for tests to pass. For
    example, when we guard "\n\n" from being converted, we really should be
    guarding for RegEx("\n\n+") instead. But that doesn't matter for our tests.
    """
    # Two newlines in a row should NOT be replaced with a space.
    txt = txt.replace("\n\n", "OMG_NEWLINE")

    # Lists should NOT be replaced with a space.
    txt = txt.replace("\n*", "OMG_STAR")
    txt = txt.replace("\n-", "OMG_HYPHEN")

    # Links broken over two lines should not get an extra space.
    txt = txt.replace("]\n(", "OMG_LINK")

    # Convert all remaining newlines into spaces.
    txt = txt.replace("\n", " ")

    # Restore everything else.
    txt = txt.replace("OMG_NEWLINE", "\n\n")
    txt = txt.replace("OMG_STAR", "\n*")
    txt = txt.replace("OMG_HYPHEN", "\n-")
    txt = txt.replace("OMG_LINK", "](")

    return txt.strip()
