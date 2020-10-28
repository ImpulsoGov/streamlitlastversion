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

import { BackMsg, ForwardMsg, IBackMsg } from "autogen/proto"

import axios from "axios"
import { ConnectionState } from "lib/ConnectionState"
import { ForwardMsgCache } from "lib/ForwardMessageCache"
import { logError, logMessage, logWarning } from "lib/log"
import Resolver from "lib/Resolver"
import { SessionInfo } from "lib/SessionInfo"
import { BaseUriParts, buildHttpUri, buildWsUri } from "lib/UriUtil"
import React, { Fragment } from "react"

/**
 * Name of the logger.
 */
const LOG = "WebsocketConnection"

/**
 * The path where we should ping (via HTTP) to see if the server is up.
 */
const SERVER_PING_PATH = "healthz"

/**
 * The path of the server's websocket endpoint.
 */
const WEBSOCKET_STREAM_PATH = "stream"

/**
 * Wait this long between pings, in millis.
 */
const PING_RETRY_PERIOD_MS = 500

/**
 * Timeout when attempting to connect to a websocket, in millis.
 * This should be <= bootstrap.py#BROWSER_WAIT_TIMEOUT_SEC.
 */
const WEBSOCKET_TIMEOUT_MS = 1000

/**
 * If the ping retrieves a 403 status code a message will be displayed.
 * This constant is the link to the documentation.
 */
const CORS_ERROR_MESSAGE_DOCUMENTATION_LINK =
  "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS"

type OnMessage = (ForwardMsg: any) => void
type OnConnectionStateChange = (
  connectionState: ConnectionState,
  errMsg?: string
) => void
type OnRetry = (totalTries: number, errorNode: React.ReactNode) => void

interface Args {
  /**
   * List of URLs to connect to. We'll try the first, then the second, etc. If
   * all fail, we'll retry from the top. The number of retries depends on
   * whether this is a local connection.
   */
  baseUriPartsList: BaseUriParts[]

  /**
   * Function called when our ConnectionState changes.
   * If the new ConnectionState is ERROR, errMsg will be defined.
   */
  onConnectionStateChange: OnConnectionStateChange

  /**
   * Function called every time we ping the server for sign of life.
   */
  onRetry: OnRetry

  /**
   * Function called when we receive a new message.
   */
  onMessage: OnMessage
}

interface MessageQueue {
  [index: number]: any
}

/**
 * Events of the WebsocketConnection state machine. Here's what the FSM looks
 * like:
 *
 *   INITIAL
 *     │
 *     │               on conn succeed
 *     v               :
 *   CONNECTING ───────────────> CONNECTED
 *     │  ^                          │
 *     │  │:on ping succeed          │
 *     │:on timeout/error/closed     │
 *     v  │                          │:on error/closed
 *   PINGING_SERVER <────────────────┘
 *
 *                    on fatal error
 *                    :
 *   <ANY_STATE> ──────────────> DISCONNECTED_FOREVER
 */
type Event =
  | "INITIALIZED"
  | "CONNECTION_CLOSED"
  | "CONNECTION_ERROR"
  | "CONNECTION_SUCCEEDED"
  | "CONNECTION_TIMED_OUT"
  | "SERVER_PING_SUCCEEDED"
  | "FATAL_ERROR" // Unrecoverable error. This should never happen!

/**
 * This class is the "brother" of StaticConnection. The class connects to the
 * server and gets deltas over a websocket connection.
 */
export class WebsocketConnection {
  private readonly args: Args

  /**
   * ForwardMessages get passed through this cache. This gets initialized
   * once we connect to the server.
   */
  private readonly cache: ForwardMsgCache

  /**
   * Index to the URI in uriList that we're going to try to connect to.
   */
  private uriIndex = 0

  /**
   * To guarantee packet transmission order, this is the index of the last
   * dispatched incoming message.
   */
  private lastDispatchedMessageIndex = -1

  /**
   * And this is the index of the next message we recieve.
   */
  private nextMessageIndex = 0

  /**
   * This dictionary stores recieved messages that we haven't sent out yet
   * (because we're still decoding previous messages)
   */
  private messageQueue: MessageQueue = {}

  /**
   * The current state of this object's state machine.
   */
  private state = ConnectionState.INITIAL

  /**
   * The WebSocket object we're connecting with.
   */
  private websocket?: WebSocket

  /**
   * WebSocket objects don't support retries, so we have to implement them
   * ourselves. We use setTimeout to wait for a connection and retry once the
   * timeout fire. This is the timer ID from setTimeout, so we can cancel it if
   * needed.
   */
  private wsConnectionTimeoutId?: number

  constructor(props: Args) {
    this.args = props
    this.cache = new ForwardMsgCache(() => this.getBaseUriParts())
    this.stepFsm("INITIALIZED")
  }

  /**
   * Return the BaseUriParts for the server we're connected to,
   * if we are connected to a server.
   */
  public getBaseUriParts(): BaseUriParts | undefined {
    if (this.state === ConnectionState.CONNECTED) {
      return this.args.baseUriPartsList[this.uriIndex]
    }
    return undefined
  }

  // This should only be called inside stepFsm().
  private setFsmState(state: ConnectionState, errMsg?: string): void {
    logMessage(LOG, `New state: ${state}`)
    this.state = state
    this.args.onConnectionStateChange(state, errMsg)

    // Perform actions when entering certain states.
    switch (this.state) {
      case ConnectionState.PINGING_SERVER:
        this.pingServer()
        break

      case ConnectionState.CONNECTING:
        this.connectToWebSocket()
        break

      case ConnectionState.DISCONNECTED_FOREVER:
        this.cancelConnectionAttempt()
        break

      case ConnectionState.CONNECTED:
      case ConnectionState.INITIAL:
      default:
        break
    }
  }

  /**
   * Process an event in our FSM.
   *
   * @param event The event to process.
   * @param errMsg an optional error message to send to the OnStateChanged
   * callback. This is meaningful only for the FATAL_ERROR event. The message
   * will be displayed to the user in a "Connection Error" dialog.
   */
  private stepFsm(event: Event, errMsg?: string): void {
    logMessage(LOG, `State: ${this.state}; Event: ${event}`)

    if (
      event === "FATAL_ERROR" &&
      this.state !== ConnectionState.DISCONNECTED_FOREVER
    ) {
      // If we get a fatal error, we transition to DISCONNECTED_FOREVER
      // regardless of our current state.
      this.setFsmState(ConnectionState.DISCONNECTED_FOREVER, errMsg)
      return
    }

    // Any combination of state+event that is not explicitly called out
    // below is illegal and raises an error.

    switch (this.state) {
      case ConnectionState.INITIAL:
        if (event === "INITIALIZED") {
          this.setFsmState(ConnectionState.CONNECTING)
          return
        }
        break

      case ConnectionState.CONNECTING:
        if (event === "CONNECTION_SUCCEEDED") {
          this.setFsmState(ConnectionState.CONNECTED)
          return
        } else if (
          event === "CONNECTION_TIMED_OUT" ||
          event === "CONNECTION_ERROR" ||
          event === "CONNECTION_CLOSED"
        ) {
          this.setFsmState(ConnectionState.PINGING_SERVER)
          return
        }
        break

      case ConnectionState.CONNECTED:
        if (event === "CONNECTION_CLOSED" || event === "CONNECTION_ERROR") {
          this.setFsmState(ConnectionState.PINGING_SERVER)
          return
        }
        break

      case ConnectionState.PINGING_SERVER:
        if (event === "SERVER_PING_SUCCEEDED") {
          this.setFsmState(ConnectionState.CONNECTING)
          return
        }
        break

      case ConnectionState.DISCONNECTED_FOREVER:
        // If we're in the DISCONNECTED_FOREVER state, we can't reasonably
        // process any events, and it's possible we're in this state because
        // of a fatal error. Just log these events rather than throwing more
        // exceptions.
        logWarning(
          LOG,
          `Discarding ${event} while in ${ConnectionState.DISCONNECTED_FOREVER}`
        )
        return

      default:
        break
    }

    throw new Error(
      "Unsupported state transition.\n" +
        `State: ${this.state}\n` +
        `Event: ${event}`
    )
  }

  private async pingServer(): Promise<void> {
    const uris = this.args.baseUriPartsList.map((_, i) =>
      buildHttpUri(this.args.baseUriPartsList[i], SERVER_PING_PATH)
    )

    this.uriIndex = await doHealthPing(
      uris,
      PING_RETRY_PERIOD_MS,
      this.args.onRetry
    )

    this.stepFsm("SERVER_PING_SUCCEEDED")
  }

  private connectToWebSocket(): void {
    const uri = buildWsUri(
      this.args.baseUriPartsList[this.uriIndex],
      WEBSOCKET_STREAM_PATH
    )

    if (this.websocket != null) {
      // This should never happen. We set the websocket to null in both FSM
      // nodes that lead to this one.
      throw new Error("Websocket already exists")
    }

    logMessage(LOG, "creating WebSocket")
    this.websocket = new WebSocket(uri)

    this.setConnectionTimeout(uri)

    const localWebsocket = this.websocket
    const checkWebsocket = (): boolean => localWebsocket === this.websocket

    this.websocket.onmessage = (event: MessageEvent) => {
      if (checkWebsocket()) {
        this.handleMessage(event.data).catch(reason => {
          const err = `Failed to process a Websocket message (${reason})`
          logError(LOG, err)
          this.stepFsm("FATAL_ERROR", err)
        })
      }
    }

    this.websocket.onopen = () => {
      if (checkWebsocket()) {
        logMessage(LOG, "WebSocket onopen")
        this.stepFsm("CONNECTION_SUCCEEDED")
      }
    }

    this.websocket.onclose = () => {
      if (checkWebsocket()) {
        logMessage(LOG, "WebSocket onclose")
        this.cancelConnectionAttempt()
        this.stepFsm("CONNECTION_CLOSED")
      }
    }

    this.websocket.onerror = () => {
      if (checkWebsocket()) {
        logMessage(LOG, "WebSocket onerror")
        this.cancelConnectionAttempt()
        this.stepFsm("CONNECTION_ERROR")
      }
    }
  }

  private setConnectionTimeout(uri: string): void {
    if (this.wsConnectionTimeoutId != null) {
      // This should never happen. We set the timeout ID to null in both FSM
      // nodes that lead to this one.
      throw new Error("WS timeout is already set")
    }

    const localWebsocket = this.websocket

    this.wsConnectionTimeoutId = window.setTimeout(() => {
      if (localWebsocket !== this.websocket) {
        return
      }

      if (this.wsConnectionTimeoutId == null) {
        // Sometimes the clearTimeout doesn't work. No idea why :-/
        logWarning(LOG, "Timeout fired after cancellation")
        return
      }

      if (this.websocket == null) {
        // This should never happen! The only place we call
        // setConnectionTimeout() should be immediately before setting
        // this.websocket.
        this.cancelConnectionAttempt()
        this.stepFsm("FATAL_ERROR", "Null Websocket in setConnectionTimeout")
        return
      }

      if (this.websocket.readyState === 0 /* CONNECTING */) {
        logMessage(LOG, `${uri} timed out`)
        this.cancelConnectionAttempt()
        this.stepFsm("CONNECTION_TIMED_OUT")
      }
    }, WEBSOCKET_TIMEOUT_MS)
    logMessage(LOG, `Set WS timeout ${this.wsConnectionTimeoutId}`)
  }

  private cancelConnectionAttempt(): void {
    // Need to make sure the websocket is closed in the same function that
    // cancels the connection timer. Otherwise, due to javascript's concurrency
    // model, when the onclose event fires it can get handled in between the
    // two functions, causing two events to be sent to the FSM: a
    // CONNECTION_TIMED_OUT and a CONNECTION_ERROR.

    if (this.websocket) {
      this.websocket.close()
      this.websocket = undefined
    }

    if (this.wsConnectionTimeoutId != null) {
      logMessage(LOG, `Clearing WS timeout ${this.wsConnectionTimeoutId}`)
      window.clearTimeout(this.wsConnectionTimeoutId)
      this.wsConnectionTimeoutId = undefined
    }
  }

  /**
   * Encodes the message with the outgoingMessageType and sends it over the
   * wire.
   */
  public sendMessage(obj: IBackMsg): void {
    if (!this.websocket) {
      return
    }
    const msg = BackMsg.create(obj)
    const buffer = BackMsg.encode(msg).finish()
    this.websocket.send(buffer)
  }

  /**
   * Called when our report has finished running. Calls through
   * to the ForwardMsgCache, to handle cached entry expiry.
   */
  public incrementMessageCacheRunCount(maxMessageAge: number): void {
    this.cache.incrementRunCount(maxMessageAge)
  }

  private async handleMessage(data: any): Promise<void> {
    // Assign this message an index.
    const messageIndex = this.nextMessageIndex
    this.nextMessageIndex += 1

    // Read in the message data.
    const result = await readFileAsync(data)
    if (this.messageQueue == null) {
      throw new Error("No message queue.")
    }

    if (result == null || typeof result === "string") {
      throw new Error(`Unexpected result from FileReader: ${result}.`)
    }

    const resultArray = new Uint8Array(result)
    const msg = ForwardMsg.decode(resultArray)
    this.messageQueue[messageIndex] = await this.cache.processMessagePayload(
      msg
    )

    // Dispatch any pending messages in the queue. This may *not* result
    // in our just-decoded message being dispatched: if there are other
    // messages that were received earlier than this one but are being
    // downloaded, our message won't be sent until they're done.
    while (this.lastDispatchedMessageIndex + 1 in this.messageQueue) {
      const dispatchMessageIndex = this.lastDispatchedMessageIndex + 1
      this.args.onMessage(this.messageQueue[dispatchMessageIndex])
      delete this.messageQueue[dispatchMessageIndex]
      this.lastDispatchedMessageIndex = dispatchMessageIndex
    }
  }
}

/**
 * Attempts to connect to the URIs in uriList (in round-robin fashion) and
 * retries forever until one of the URIs responds with 'ok'.
 * Returns a promise with the index of the URI that worked.
 */
function doHealthPing(
  uriList: string[],
  timeoutMs: number,
  retryCallback: OnRetry
): Promise<number> {
  const resolver = new Resolver<number>()
  let totalTries = 0
  let uriNumber = 0
  let tryTimestamp = Date.now()

  // Hoist the connect() declaration.
  let connect = (): void => {}

  const retryImmediately = (): void => {
    uriNumber++
    if (uriNumber >= uriList.length) {
      uriNumber = 0
    }

    connect()
  }

  // Make sure we don't retry faster than timeoutMs. This is required because
  // in some cases things fail very quickly, and all our fast retries end up
  // bogging down the browser.
  const retry = (errorNode: React.ReactNode): void => {
    const tryDuration = (Date.now() - tryTimestamp) / 1000
    const retryTimeout = tryDuration < timeoutMs ? timeoutMs - tryDuration : 0

    retryCallback(totalTries, errorNode)

    window.setTimeout(retryImmediately, retryTimeout)
  }

  const retryWhenTheresNoResponse = (): void => {
    const uri = new URL(uriList[uriNumber])

    if (uri.hostname === "localhost") {
      const commandLine = SessionInfo.isSet()
        ? SessionInfo.current.commandLine
        : "streamlit run yourscript.py"
      retry(
        <Fragment>
          <p>
            Is Streamlit still running? If you accidentally stopped Streamlit,
            just restart it in your terminal:
          </p>
          <pre>
            <code className="bash">{commandLine}</code>
          </pre>
        </Fragment>
      )
    } else {
      retry("Connection failed with status 0.")
    }
  }

  const retryWhenIsForbidden = (): void => {
    retry(
      <Fragment>
        <p>Cannot connect to Streamlit (HTTP status: 403).</p>
        <p>
          If you are trying to access a Streamlit app running on another
          server, this could be due to the app's{" "}
          <a href={CORS_ERROR_MESSAGE_DOCUMENTATION_LINK}>CORS</a> settings.
        </p>
      </Fragment>
    )
  }

  connect = () => {
    const uri = uriList[uriNumber]
    logMessage(LOG, `Attempting to connect to ${uri}.`)
    tryTimestamp = Date.now()

    if (uriNumber === 0) {
      totalTries++
    }

    axios
      .get(uri, {
        timeout: timeoutMs,
      })
      .then(() => {
        resolver.resolve(uriNumber)
      })
      .catch(error => {
        if (error.code === "ECONNABORTED") {
          return retry("Connection timed out.")
        }

        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx

          const { data, status } = error.response

          if (status === /* NO RESPONSE */ 0) {
            return retryWhenTheresNoResponse()
          } else if (status === 403) {
            return retryWhenIsForbidden()
          } else {
            return retry(
              `Connection failed with status ${status}, ` +
                `and response "${data}".`
            )
          }
        } else if (error.request) {
          // The request was made but no response was received
          // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
          // http.ClientRequest in node.js
          return retryWhenTheresNoResponse()
        } else {
          // Something happened in setting up the request that triggered an Error
          return retry(error.message)
        }
      })
  }

  connect()

  return resolver.promise
}

/**
 * Wrap FileReader.readAsArrayBuffer in a Promise.
 */
function readFileAsync(data: any): Promise<string | ArrayBuffer | null> {
  return new Promise<any>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsArrayBuffer(data)
  })
}
