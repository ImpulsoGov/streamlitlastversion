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

import Clipboard from "clipboard"
import React, { PureComponent, ReactNode, createRef } from "react"
import { Copy as CopyIcon } from "react-feather"

interface Props {
  text: string
}

class CopyButton extends PureComponent<Props> {
  private button = createRef<HTMLButtonElement>()
  private clipboard: ClipboardJS | null = null

  public componentDidMount = (): void => {
    const node = this.button.current

    if (node !== null) {
      this.clipboard = new Clipboard(node)
    }
  }

  public componentWillUnmount = (): void => {
    if (this.clipboard !== null) {
      this.clipboard.destroy()
    }
  }

  public render = (): ReactNode => (
    <button
      className="overlayBtn"
      title="Copy to clipboard"
      ref={this.button}
      data-clipboard-text={this.props.text}
    >
      <CopyIcon size="16" />
    </button>
  )
}

export default CopyButton
