import { AxiosInstance } from 'axios';
import APISubRoutes from './APISubRoutes';

/**
 * title: Koact api document
 * description: This is description.
 */
export default class RootAPI {
  public apiSubRoutes: APISubRoutes;

  private _axiosInstance: AxiosInstance;

  constructor(axiosInstance: AxiosInstance) {
    this._axiosInstance = axiosInstance;
    this.apiSubRoutes = new APISubRoutes(axiosInstance);
  }

  // GET root
  public async root(q_foo: string): Promise<string> {
    const { data } = await this._axiosInstance.get<string>('/', {
      params: { foo: q_foo },
    });
    return data;
  }
}
