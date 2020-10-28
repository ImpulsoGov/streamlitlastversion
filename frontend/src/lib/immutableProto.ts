/**
 * @license
 * Copyright 2018-2020 Streamlit Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { fromJS, Map } from "immutable"
import { IS_DEV_ENV } from "./baseconsts"
import { logMessage } from "./log"

/**
 * Converts a protobuf JS object into its immutable counterpart.
 */
export function toImmutableProto(messageType: any, message: any): any {
  const x = messageType.toObject(message, {
    defaults: true,
    oneofs: true,
  })
  if (IS_DEV_ENV) {
    logMessage("Protobuf: ", x)
  }
  return fromJS(x)
}

/**
 * Applies a function based on the type of a protobuf oneof field.
 *
 * obj   - The immutable protobuf object we're applying this to.
 * name  - The name of the oneof field.
 * funcs - Dictionary of functions, one for each oneof field. Optionally, you
 * may pass a key-value pair {'_else': errorFunc} to hanle the case where there
 * is no match. If such a function is not passed, we throw an error if there's
 * no match.
 */

export function dispatchOneOf(
  obj: Map<string, any>,
  name: string,
  funcs: any
): any {
  const whichOne = obj.get(name)
  if (whichOne in funcs) {
    return funcs[whichOne](obj.get(whichOne))
  } else if (funcs._else) {
    return funcs._else()
  } else {
    throw new Error(`Cannot handle ${name} "${whichOne}".`)
  }
}

/**
 * Updates a oneof field of an immutable protobuf based on its type.
 *
 * obj   - The immutable protobuf object we're applying this to.
 * name  - The name of the oneof field.
 * funcs - Dictionary of update functions, one for each oneof field.
 */
export function updateOneOf(
  obj: Map<string, any>,
  name: string,
  funcs: any
): any {
  const whichOne = obj.get(name)
  if (whichOne in funcs) {
    return obj.update(whichOne, funcs[whichOne])
  } else {
    throw new Error(`Cannot handle ${name} "${whichOne}".`)
  }
}

/**
 * Returns a value based on the type of a protobuf oneof field.
 *
 * obj   - The immutable protobuf object we're applying this to.
 * name  - The name of the oneof field.
 * funcs - Dictionary of values, one for each oneof field.
 */
export function mapOneOf(
  obj: Map<string, any>,
  name: string,
  values: any
): any {
  const whichOne = obj.get(name)
  if (whichOne in values) {
    return values[whichOne]
  }

  throw new Error(`Cannot handle ${name} "${whichOne}".`)
}
