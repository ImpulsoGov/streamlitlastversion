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
import { shallow } from "enzyme"
import { fromJS } from "immutable"

import Audio, { Props } from "./Audio"

const getProps = (elementProps: object = {}): Props => ({
  element: fromJS({
    startTime: 0,
    url: "/media/08a569df5f3bd617f11b7d137861a3bef91379309ce95bdb9ff04a38.wav",
    ...elementProps,
  }),
  width: 0,
})

describe("Audio Element", () => {
  const props = getProps()
  const wrapper = shallow(<Audio {...props} />)
  const audioElement = wrapper.find("audio")

  it("renders without crashing", () => {
    expect(audioElement.length).toBe(1)
  })

  it("should have controls", () => {
    expect(audioElement.prop("controls")).toBeDefined()
  })

  describe("should have a src", () => {
    it("when the url starts with media", () => {
      expect(audioElement.prop("src")).toBe(
        "http://localhost:80/media/08a569df5f3bd617f11b7d137861a3bef91379309ce95bdb9ff04a38.wav"
      )
    })

    it("when it's a complete url", () => {
      const props = getProps({
        url: "http://localhost:80/media/sound.wav",
      })
      const wrapper = shallow(<Audio {...props} />)
      const audioElement = wrapper.find("audio")

      expect(audioElement.prop("src")).toBe(props.element.get("url"))
    })
  })

  it("should update time when the prop is changed", () => {
    const props = getProps({
      url: "http://localhost:80/media/sound.wav",
    })

    const wrapper = shallow(<Audio {...props} />)
    const instance = wrapper.instance()

    // @ts-ignore
    instance.audioRef = {
      current: {
        currentTime: 0,
      },
    }

    wrapper.setProps(
      getProps({
        startTime: 10,
      })
    )

    // @ts-ignore
    expect(instance.audioRef.current.currentTime).toBe(10)
  })
})
