// Module dependencies & types
import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  Method,
} from "axios";
import defu from "defu";
import qs from "qs";
import Cookies from "js-cookie";

// Load custom types
import type {
  StrapiAuthenticationData,
  StrapiAuthenticationResponse,
  StrapiAuthProvider,
  StrapiBaseRequestParams,
  StrapiDefaultOptions,
  StrapiEmailConfirmationData,
  StrapiError,
  StrapiForgotPasswordData,
  StrapiOptions,
  StrapiRegistrationData,
  StrapiRequestParams,
  StrapiResetPasswordData,
  StrapiResponse,
  StrapiUser,
} from "./types";

// Load utils methods
import { isBrowser } from "./utils";

// Strapi options' default values
const defaults: StrapiDefaultOptions = {
  url: "http://localhost:1337",
  prefix: "/api",
  store: {
    key: "strapi_jwt",
    useLocalStorage: false,
    cookieOptions: { path: "/" },
  },
  axiosOptions: {},
};

export class Strapi {
  public axios: AxiosInstance;
  public options: StrapiDefaultOptions;
  private _user: StrapiUser | null = null;

  /**
   * Strapi SDK Constructor
   *
   * @constructor
   * @param {StrapiOptions} options? - Options in order to configure API URL, list your Content Types & extend the axios configuration
   * @param {string} options.url? - Your Strapi API URL, Default: http://localhost::1337
   * @param {StoreConfig} options.store? - Config the way you want to store JWT (Cookie or LocalStorage)
   * @param {AxiosRequestConfig} options.axiosOptions? - The list of your Content type on your Strapi API
   */
  constructor(options?: StrapiOptions) {
    // merge given options with default values
    this.options = defu((options as StrapiDefaultOptions) || {}, defaults);

    // create axios instance
    this.axios = axios.create({
      baseURL: new URL(this.options.prefix, this.options.url).href,
      paramsSerializer: qs.stringify,
      ...this.options.axiosOptions,
    });

    // Synchronize token if already exist
    this.syncToken();
  }

  get user(): StrapiUser | null {
    return this._user;
  }

  set user(user: StrapiUser | null) {
    this._user = user;
  }

  /**
   * Basic axios request
   *
   * @param  {Method} method - HTTP method
   * @param  {string} url - Custom or Strapi API URL
   * @param  {AxiosRequestConfig} axiosConfig? - Custom Axios config
   * @returns Promise<T>
   */
  public async request<T>(
    method: Method,
    url: string,
    axiosConfig?: AxiosRequestConfig
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.axios.request<T>({
        method,
        url,
        ...axiosConfig,
      });
      return response.data;
    } catch (error) {
      const e = error as AxiosError<StrapiError>;

      if (!e.response) {
        throw {
          data: null,
          error: {
            status: 500,
            name: "UnknownError",
            message: e.message,
            details: e,
          },
        };
      } else {
        throw e.response.data;
      }
    }
  }
  /**
   * Authenticate user & retrieve his JWT
   *
   * @param  {StrapiAuthenticationData} data - User authentication form data: `identifier`, `password`
   * @param  {string} data.identifier - The email or username of the user
   * @param  {string} data.password - The password of the user
   * @returns Promise<StrapiAuthenticationResponse>
   */
  public async login(
    data: StrapiAuthenticationData
  ): Promise<StrapiAuthenticationResponse> {
    this.removeToken();
    const { user, jwt }: StrapiAuthenticationResponse =
      await this.request<StrapiAuthenticationResponse>("post", "/auth/local", {
        data,
      });
    this.setToken(jwt);
    this.setUser(user);
    return { user, jwt };
  }

  /**
   * Register a new user & retrieve JWT
   *
   * @param  {StrapiRegistrationData} data - New user registration data: `username`, `email`, `password`
   * @param  {string} data.username - Username of the new user
   * @param  {string} data.email - Email of the new user
   * @param  {string} data.password - Password of the new user
   * @returns Promise<StrapiAuthenticationResponse>
   */
  public async register(
    data: StrapiRegistrationData
  ): Promise<StrapiAuthenticationResponse> {
    this.removeToken();
    const { user, jwt }: StrapiAuthenticationResponse =
      await this.request<StrapiAuthenticationResponse>(
        "post",
        "/auth/local/register",
        {
          data,
        }
      );
    this.setToken(jwt);
    this.setUser(user);
    return { user, jwt };
  }

  /**
   * Send an email to a user in order to reset his password
   *
   * @param  {StrapiForgotPasswordData} data - Forgot password data: `email`
   * @param  {string} data.email - Email of the user who forgot his password
   * @returns Promise<void>
   */
  public async forgotPassword(data: StrapiForgotPasswordData): Promise<void> {
    this.removeToken();
    return this.request("post", "/auth/forgot-password", { data });
  }

  /**
   * Reset the user password
   *
   * @param  {StrapiResetPasswordData} data - Reset password data object: `code`, `password`, `passwordConfirmation`
   * @param  {string} data.code - Code received by email after calling the `forgotPassword` method
   * @param  {string} data.password - New password of the user
   * @param  {string} data.passwordConfirmation - Confirmation of the new password of the user
   * @returns Promise<StrapiAuthenticationResponse>
   */
  public async resetPassword(
    data: StrapiResetPasswordData
  ): Promise<StrapiAuthenticationResponse> {
    this.removeToken();
    const { user, jwt }: StrapiAuthenticationResponse =
      await this.request<StrapiAuthenticationResponse>(
        "post",
        "/auth/reset-password",
        {
          data,
        }
      );
    this.setToken(jwt);
    this.setUser(user);
    return { user, jwt };
  }

  /**
   * Send programmatically an email to a user in order to confirm his account
   *
   * @param  {StrapiEmailConfirmationData} data - Email confirmation data: `email`
   * @param  {string} data.email - Email of the user who want to be confirmed
   * @returns Promise<void>
   */
  public async sendEmailConfirmation(
    data: StrapiEmailConfirmationData
  ): Promise<void> {
    return this.request("post", "/auth/send-email-confirmation", {
      data,
    });
  }
  /**
   * Get the correct URL to authenticate with provider
   *
   * @param  {StrapiAuthProvider} provider - Provider name
   * @returns string
   */
  public getProviderAuthenticationUrl(provider: StrapiAuthProvider): string {
    return new URL(`/connect/${provider}`, this.options.url).href;
  }

  /**
   * Authenticate user with the token present on the URL or in `params`
   *
   * @param  {StrapiAuthProvider} provider - Provider name
   * @param  {string} access_token? - Access Token return from Strapi
   * @returns Promise<StrapiAuthenticationResponse>
   */
  public async authenticateProvider(
    provider: StrapiAuthProvider,
    access_token?: string
  ): Promise<StrapiAuthenticationResponse> {
    this.removeToken();
    if (isBrowser()) {
      const params = qs.parse(window.location.search, {
        ignoreQueryPrefix: true,
      });
      if (params.access_token) access_token = params.access_token as string;
    }
    const { user, jwt }: StrapiAuthenticationResponse = await this.request(
      "get",
      `/auth/${provider}/callback`,
      {
        params: { access_token },
      }
    );
    this.setToken(jwt);
    this.setUser(user);
    return { user, jwt };
  }

  /**
   * Logout by removing authentication token
   *
   * @returns void
   */
  public logout(): void {
    this.setUser(null);
    this.removeToken();
  }

  /**
   * Get a list of {content-type} entries
   *
   * @param  {string} contentType - Content type's name pluralized
   * @param  {StrapiRequestParams} params? - Query parameters
   * @returns Promise<StrapiResponse<T>>
   */
  public find<T>(
    contentType: string,
    params?: StrapiRequestParams
  ): Promise<StrapiResponse<T>> {
    return this.request<StrapiResponse<T>>("get", `/${contentType}`, {
      params,
    });
  }

  /**
   * Get a specific {content-type} entry
   *
   * @param  {string} contentType - Content type's name pluralized
   * @param  {string|number} id - ID of entry
   * @param  {StrapiBaseRequestParams} params? - Fields selection & Relations population
   * @returns Promise<StrapiResponse<T>>
   */
  public findOne<T>(
    contentType: string,
    id: string | number,
    params?: StrapiBaseRequestParams
  ): Promise<StrapiResponse<T>> {
    return this.request<StrapiResponse<T>>("get", `/${contentType}/${id}`, {
      params,
    });
  }

  /**
   * Create a {content-type} entry
   *
   * @param  {string} contentType - Content type's name pluralized
   * @param  {AxiosRequestConfig["data"]} data - New entry
   * @param  {StrapiBaseRequestParams} params? - Fields selection & Relations population
   * @returns Promise<StrapiResponse<T>>
   */
  public create<T>(
    contentType: string,
    data: AxiosRequestConfig["data"],
    params?: StrapiBaseRequestParams
  ): Promise<StrapiResponse<T>> {
    return this.request<StrapiResponse<T>>("post", `/${contentType}`, {
      data: { data },
      params,
    });
  }

  /**
   * Update a specific entry
   *
   * @param  {string} contentType - Content type's name pluralized
   * @param  {string|number} id - ID of entry to be updated
   * @param  {AxiosRequestConfig["data"]} data - New entry data
   * @param  {StrapiBaseRequestParams} params? - Fields selection & Relations population
   * @returns Promise<StrapiResponse<T>>
   */
  public update<T>(
    contentType: string,
    id: string | number,
    data: AxiosRequestConfig["data"],
    params?: StrapiBaseRequestParams
  ): Promise<StrapiResponse<T>> {
    return this.request<StrapiResponse<T>>("put", `/${contentType}/${id}`, {
      data: { data },
      params,
    });
  }

  /**
   * Delete en entry
   *
   * @param  {string} contentType - Content type's name pluralized
   * @param  {string|number} id - ID of entry to be deleted
   * @param  {StrapiBaseRequestParams} params? - Fields selection & Relations population
   * @returns Promise<StrapiResponse<T>>
   */
  public delete<T>(
    contentType: string,
    id: string | number,
    params?: StrapiBaseRequestParams
  ): Promise<StrapiResponse<T>> {
    return this.request<StrapiResponse<T>>("delete", `/${contentType}/${id}`, {
      params,
    });
  }

  /**
   * Define local data of the logged-in user
   *
   * @param  {StrapiUser | null} user - New user data
   * @returns void
   */
  public setUser(user: StrapiUser | null): void {
    this._user = user;
  }

  /**
   * Refresh local data of the logged-in user
   *
   * @returns Promise<StrapiUser | null>
   */
  public async fetchUser(): Promise<StrapiUser | null> {
    try {
      const user = await this.request<StrapiUser | null>("get", "/users/me");
      this.setUser(user);
    } catch (e) {
      this.logout();
    }

    return this._user;
  }

  /**
   * Sync token between storage & header when SDK is instantiate
   *
   * @returns void
   */
  private syncToken(): void {
    const { useLocalStorage, key } = this.options.store;
    if (isBrowser()) {
      const token = useLocalStorage
        ? window.localStorage.getItem(key)
        : Cookies.get(key);

      if (token) {
        this.axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      }
    }
  }
  /**
   * Set token in Axios headers & in choosen storage
   *
   * @param  {string} token - Token retrieve from login or register method
   * @returns void
   */
  public setToken(token: string): void {
    const { useLocalStorage, key, cookieOptions } = this.options.store;
    this.axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    if (isBrowser()) {
      useLocalStorage
        ? window.localStorage.setItem(key, token)
        : Cookies.set(key, token, cookieOptions);
    }
  }
  /**
   * Remove token in Axios headers & in choosen storage (Cookies or Local)
   *
   * @returns void
   */
  public removeToken(): void {
    const { useLocalStorage, key } = this.options.store;
    delete this.axios.defaults.headers.common["Authorization"];
    if (isBrowser()) {
      useLocalStorage
        ? window.localStorage.removeItem(key)
        : Cookies.remove(key);
    }
  }
}
