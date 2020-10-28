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
import { fromJS } from "immutable"
import { shallow, mount } from "enzyme"
import { BokehChart as BokehChartProto } from "autogen/proto"

import Figure from "./mock"

import { PropsWithHeight } from "./BokehChart"

const mockBokehEmbed = {
  embed: {
    embed_item: jest.fn(),
  },
}

jest.mock("@bokeh/bokehjs", () => mockBokehEmbed)

const BokehChart = require("./BokehChart").BokehChart

const getProps = (
  elementProps: Partial<BokehChartProto> = {}
): PropsWithHeight => ({
  element: fromJS({
    figure: JSON.stringify(Figure),
    useContainerWidth: false,
    ...elementProps,
  }),
  height: 400,
  width: 400,
  index: 1,
})

expect.extend({
  toMatchBokehDimensions(data, width, height) {
    const plot =
      data && data.doc && data.doc.roots && data.doc.roots.references
        ? data.doc.roots.references.find((e: any) => e.type === "Plot")
        : undefined

    if (!plot) {
      return {
        message: () => `expected data to contain attributes`,
        pass: false,
      }
    }

    const pass =
      plot.attributes.plot_width === width &&
      plot.attributes.plot_height === height

    return {
      message: () =>
        `expected ${plot.attributes.plot_width}x${plot.attributes.plot_height} to be ${width}x${height}`,
      pass,
    }
  },
})

describe("BokehChart element", () => {
  // Avoid Warning: render(): Rendering components directly into document.body is discouraged.
  beforeAll(() => {
    const div = document.createElement("div")
    window.domNode = div
    document.body.appendChild(div)
  })

  beforeEach(() => {
    mockBokehEmbed.embed.embed_item.mockClear()
  })

  it("renders without crashing", () => {
    const props = getProps()
    const wrapper = shallow(<BokehChart {...props} />, {
      attachTo: window.domNode,
    })

    expect(wrapper.find("div").length).toBe(1)
  })

  describe("Chart dimensions", () => {
    it("should use height if not useContainerWidth", () => {
      const props = getProps()
      mount(<BokehChart {...props} />, {
        attachTo: window.domNode,
      })

      expect(mockBokehEmbed.embed.embed_item).toHaveBeenCalledWith(
        expect.toMatchBokehDimensions(400, 400),
        "bokeh-chart-1"
      )
    })

    it("should have width if useContainerWidth", () => {
      const props = {
        ...getProps({
          useContainerWidth: true,
        }),
        height: 0,
      }

      mount(<BokehChart {...props} />, {
        attachTo: window.domNode,
      })

      expect(mockBokehEmbed.embed.embed_item).toHaveBeenCalledWith(
        expect.toMatchBokehDimensions(400),
        "bokeh-chart-1"
      )
    })
  })

  it("should re-render the chart when the component updates", () => {
    const props = getProps()
    const wrapper = shallow(<BokehChart {...props} />, {
      attachTo: window.domNode,
    })

    wrapper.setProps({
      width: 500,
      height: 500,
    })

    expect(mockBokehEmbed.embed.embed_item).toHaveBeenCalledTimes(2)
  })
})
