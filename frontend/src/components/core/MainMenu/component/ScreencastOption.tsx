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

import React from "react"
import { DropdownItem } from "reactstrap"

interface Props {
  screenCastState: string
  onClick: () => void
}

const ScreencastOption = ({
  screenCastState,
  onClick,
}: Props): JSX.Element => {
  if (screenCastState === "COUNTDOWN") {
    return (
      <DropdownItem onClick={onClick}>
        <span>Cancel screencast</span>
        <span className="shortcut">ESC</span>
      </DropdownItem>
    )
  }

  if (screenCastState === "RECORDING") {
    return (
      <DropdownItem onClick={onClick} className="stop-recording">
        <span>
          <strong>Stop recording</strong>
        </span>

        <span className="shortcut">ESC</span>
      </DropdownItem>
    )
  }

  return <DropdownItem onClick={onClick}>Record a screencast</DropdownItem>
}

export default ScreencastOption
