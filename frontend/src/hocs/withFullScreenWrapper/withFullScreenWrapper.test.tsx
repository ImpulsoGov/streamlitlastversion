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

import React, { ComponentType } from "react"
import { fromJS } from "immutable"
import { shallow, mount } from "enzyme"

import FullScreenWrapper from "components/shared/FullScreenWrapper"
import withFullScreenWrapper, {
  ReportElementProps,
} from "./withFullScreenWrapper"

const testComponent: ComponentType = () => <div>test</div>

const getProps = (
  props: Partial<ReportElementProps> = {}
): ReportElementProps => ({
  element: fromJS({
    id: 1,
    label: "Label",
  }),
  width: 100,
  ...props,
})

describe("withFullScreenWrapper HOC", () => {
  it("renders without crashing", () => {
    const props = getProps()
    const WithHoc = withFullScreenWrapper(testComponent)
    // @ts-ignore
    const wrapper = shallow(<WithHoc {...props} />)

    expect(wrapper.html()).not.toBeNull()
  })

  it("should render a component wrapped with FullScreenWrapper", () => {
    const props = getProps()
    const WithHoc = withFullScreenWrapper(testComponent)
    // @ts-ignore
    const wrapper = mount(<WithHoc {...props} />)
    const fullScreenWrapper = wrapper.find(FullScreenWrapper)

    expect(fullScreenWrapper.props().width).toBe(props.width)
    expect(fullScreenWrapper.props().height).toBeUndefined()
  })

  it("should render FullScreenWrapper with an specific height", () => {
    const props = getProps({
      height: 100,
    })
    const WithHoc = withFullScreenWrapper(testComponent)
    // @ts-ignore
    const wrapper = mount(<WithHoc {...props} />)
    const fullScreenWrapper = wrapper.find(FullScreenWrapper)

    expect(fullScreenWrapper.props().width).toBe(props.width)
    expect(fullScreenWrapper.props().height).toBe(props.height)
  })
})
