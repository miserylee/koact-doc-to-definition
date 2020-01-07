import { AxiosInstance } from 'axios';

/**
 * title: subRoutes
 */
export default class APISubRoutes {
  private _axiosInstance: AxiosInstance;

  constructor(axiosInstance: AxiosInstance) {
    this._axiosInstance = axiosInstance;
  }
}
