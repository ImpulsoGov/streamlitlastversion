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
import DeckGL from "deck.gl"
import { shallow } from "enzyme"
import { fromJS } from "immutable"

import { DeckGlJsonChart, PropsWithHeight } from "./DeckGlJsonChart"

const getProps = (elementProps: object = {}): PropsWithHeight => ({
  element: fromJS({
    json: `{"initialViewState": {"bearing": -27.36, "latitude": 52.2323, "longitude": -1.415, "maxZoom": 15, "minZoom": 5, "pitch": 40.5, "zoom": 6}, "layers": [{"@@type": "HexagonLayer", "autoHighlight": true, "coverage": 1, "data": "https://raw.githubusercontent.com/uber-common/deck.gl-data/master/examples/3d-heatmap/heatmap-data.csv", "elevationRange": [0, 3000], "elevationScale": 50, "extruded": true, "getPosition": "@@=[lng, lat]", "id": "0533490f-fcf9-4dc0-8c94-ae4fbd42eb6f", "pickable": true}], "mapStyle": "mapbox://styles/mapbox/light-v9", "views": [{"@@type": "MapView", "controller": true}]}`,
    ...elementProps,
  }),
  width: 0,
  mapboxToken: "mapboxToken",
  height: undefined,
})

describe("DeckGlJsonChart element", () => {
  it("renders without crashing", () => {
    const props = getProps()
    const wrapper = shallow(<DeckGlJsonChart {...props} />)

    expect(wrapper.find(DeckGL).length).toBe(1)
  })

  it("should render tooltip", () => {
    const props = getProps({
      tooltip: `{"html": "<b>Elevation Value:</b> {elevationValue}", "style": {"color": "white"}}`,
    })
    const wrapper = shallow(<DeckGlJsonChart {...props} />)
    const DeckGL = wrapper.find("DeckGL")

    expect(DeckGL.length).toBe(1)
    expect(DeckGL.prop("getTooltip")).toBeDefined()

    // @ts-ignore
    const createdTooltip = DeckGL.prop("getTooltip")({
      object: {
        elevationValue: 10,
      },
    })

    expect(createdTooltip.html).toBe("<b>Elevation Value:</b> 10")
  })
})
