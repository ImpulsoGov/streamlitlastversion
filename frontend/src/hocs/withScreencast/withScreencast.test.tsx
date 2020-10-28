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

jest.mock("lib/ScreenCastRecorder")

import React, { ComponentType } from "react"
import { shallow } from "enzyme"

import withScreencast, { ScreenCastHOC } from "./withScreencast"
import Countdown from "components/core/Countdown"
import {
  ScreencastDialog,
  UnsupportedBrowserDialog,
  VideoRecordedDialog,
} from "./components"

const testComponent: ComponentType = () => <div>test</div>

describe("withScreencast HOC", () => {
  it("renders without crashing", () => {
    const WithHoc = withScreencast(testComponent)
    const wrapper = shallow(<WithHoc />)

    expect(wrapper.html()).not.toBeNull()
  })

  it("wrapped component should have screenCast prop", () => {
    const WithHoc = withScreencast(testComponent)
    const wrapper = shallow(<WithHoc />)

    // @ts-ignore
    expect(wrapper.find(testComponent).props().screenCast).toBeDefined()
  })

  describe("Steps", () => {
    const WithHoc = withScreencast(testComponent)
    const wrapper = shallow(<WithHoc />)

    // @ts-ignore
    wrapper.instance().checkSupportedBrowser = () => true

    // @ts-ignore
    wrapper
      .find(testComponent)
      .props()
      .screenCast.startRecording("screencast-filename")

    it("should show a configuration dialog before start recording", () => {
      expect(wrapper.find(ScreencastDialog).length).toBe(1)
    })

    it("should show a countdown after setup", async () => {
      await wrapper
        .find(ScreencastDialog)
        .props()
        .startRecording()

      const countdownWrapper = wrapper.find(Countdown)

      expect(countdownWrapper.length).toBe(1)
    })

    it("should be on recording state after countdown", async () => {
      const countdownWrapper = wrapper.find(Countdown)

      // @ts-ignore
      wrapper.instance().recorder.start = jest.fn().mockReturnValue(true)

      await countdownWrapper.props().endCallback()

      const wrappedComponentProps: {
        screenCast: ScreenCastHOC
      } = wrapper.find(testComponent).props() as any

      expect(wrappedComponentProps.screenCast.currentState).toBe("RECORDING")
    })

    it("should show recorded dialog after recording", async () => {
      const wrappedComponentProps: {
        screenCast: ScreenCastHOC
      } = wrapper.find(testComponent).props() as any

      // @ts-ignore
      wrapper.instance().recorder.stop = jest
        .fn()
        .mockReturnValue(new Blob([]))

      await wrappedComponentProps.screenCast.stopRecording()

      expect(wrapper.state("currentState")).toBe("PREVIEW_FILE")
      expect(wrapper.find(VideoRecordedDialog).length).toBe(1)
    })
  })

  it("should show an unsupported dialog", () => {
    const WithHoc = withScreencast(testComponent)
    const wrapper = shallow(<WithHoc />)

    // @ts-ignore
    wrapper.instance().checkSupportedBrowser = () => false

    // @ts-ignore
    wrapper
      .find(testComponent)
      .props()
      .screenCast.startRecording("screencast-filename")

    expect(wrapper.find(UnsupportedBrowserDialog).length).toBe(1)
  })
})
