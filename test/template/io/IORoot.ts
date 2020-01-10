import { ObjectId } from 'bson';
import { ClientSession } from 'mongoose';
import MSIO, { IBody, IMSQueueOptionalOptions, IParams } from 'msio';

export interface IRootDispatcherBody {
  key: string;
}

export interface IRootFetcherParams {
  key: string;
}

export interface IRootFetcherResponse {
  foo: number;
}

export interface IRootRequesterBody {
  bar: boolean;
}

export interface IRootRequesterResponse {
  hello: string;
}

export default class IORoot {
  private _msio: MSIO;
  private _service: number;

  constructor(msio: MSIO, destination: {
    service: number;
    baseURL: string;
    pulseInterval?: number;
    options: IMSQueueOptionalOptions;
  }) {
    msio.addDestination(destination.service, destination.baseURL, destination.pulseInterval || 10000, destination.options);
    this._msio = msio;
    this._service = destination.service;
  }

  public rootDispatcher(body: IRootDispatcherBody) {
    return this._dispatcherWrapper('/', body);
  }

  public rootFetcher(params: IRootFetcherParams) {
    return this._fetcherWrapper<IRootFetcherResponse>('/', params);
  }

  public rootRequester(body: IRootRequesterBody) {
    return this._requesterWrapper<IRootRequesterResponse>('/', body);
  }

  private _dispatcherWrapper(path: string, body: IBody = {}) {
    return {
      dispatch: async (session?: ClientSession, producer = 'UNKNOWN') => {
        return this._msio.write(
          this._service,
          path,
          body,
          producer,
          session,
        );
      },
      orderedDispatch: async (depends: ObjectId, session?: ClientSession, producer = 'UNKNOWN') => {
        return this._msio.orderedWrite(
          this._service,
          depends,
          path,
          body,
          producer,
          session,
        );
      },
    };
  }

  private _fetcherWrapper<T>(path: string, params: IParams = {}) {
    return {
      weakFetch: async (defaultValue: T) => {
        return this._msio.weakRead<T>(
          this._service,
          defaultValue,
          path,
          params,
        );
      },
      fetch: async () => {
        return this._msio.read<T>(
          this._service,
          path,
          params,
        );
      },
    };
  }

  private _requesterWrapper<T>(path: string, body: IBody = {}) {
    return {
      request: async () => {
        return this._msio.writeRead<T>(
          this._service,
          path,
          body,
        );
      },
    };
  }
}
