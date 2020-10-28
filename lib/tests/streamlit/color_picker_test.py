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

"""color_picker unit test."""
import pytest
from tests import testutil
import streamlit as st
from streamlit.errors import StreamlitAPIException
from parameterized import parameterized


class ColorPickerTest(testutil.DeltaGeneratorTestCase):
    def test_just_label(self):
        """Test that it can be called with no value."""
        st.beta_color_picker("the label")

        c = self.get_delta_from_queue().new_element.color_picker
        self.assertEqual(c.label, "the label")
        self.assertEqual(c.default, "#000000")

    @parameterized.expand([("#333333", "#333333"), ("#333", "#333"), (None, "#000000")])
    def test_value_types(self, arg_value, proto_value):
        """Test that it supports different types of values."""
        st.beta_color_picker("the label", arg_value)

        c = self.get_delta_from_queue().new_element.color_picker
        self.assertEqual(c.label, "the label")
        self.assertEqual(c.default, proto_value)

    def test_invalid_value_type_error(self):
        """Tests that when the value type is invalid, an exception is generated"""
        with pytest.raises(StreamlitAPIException) as exc_message:
            st.beta_color_picker("the label", 1234567)

    def test_invalid_string(self):
        """Tests that when the string doesn't match regex, an exception is generated"""
        with pytest.raises(StreamlitAPIException) as exc_message:
            st.beta_color_picker("the label", "#invalid-string")
