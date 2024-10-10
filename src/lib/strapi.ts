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
import { cleanDoubleSlashes, joinURL } from "ufo";

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
  StrapiChangePasswordData,
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
  axiosCreate(instanceConfig) {
    return axios.create(instanceConfig);
  }
};

export class Strapi {
  public axios: AxiosInstance;
  public options: StrapiDefaultOptions;
  public user: StrapiUser = null;

  /**
   * Strapi SDK Constructor
   *
   * @constructor
   * @param {StrapiOptions} options? - Options in order to configure API URL, list your Content Types & extend the axios configuration
   * @param {string} options.url? - Your Strapi API URL, Default: http://localhost::1337
   * @param {StoreConfig} options.store? - Config the way you want to store JWT (Cookie or LocalStorage)
   * @param {AxiosRequestConfig} options.axiosOptions? - The list of your Content type on your Strapi API
   * @param {Function} options.axiosCreate? - Axios instance creator function
   */
  constructor(options?: StrapiOptions) {
    // merge given options with default values
    const _options = defu(options || {}, defaults);

    // clean url & prefix
    this.options = {
      ..._options,
      url: cleanDoubleSlashes(_options?.url),
      prefix: cleanDoubleSlashes(_options?.prefix),
    };

    // create axios instance
    this.axios = this.options.axiosCreate({
      baseURL: joinURL(this.options.url, this.options.prefix),
      paramsSerializer: qs.stringify,
      ...this.options.axiosOptions,
    })

    // Synchronize token before each request
    this.axios.interceptors.request.use((config) => {
      const token = this.getToken();
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        };
      }

      return config;
    });
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
    this.user = user;
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
    this.user = user;
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
   * Change the password of the logged in user.
   * @author AnnikenYT
   *
   * @param {StrapiChangePasswordData} data - Change password data: `currentPassword`, `password`, `passwordConfirmation`
   * @param {string} data.currentPassword - The current password of the user
   * @param {string} data.password - The new password of the user
   * @param {string} data.passwordConfirmation - Confirmation of the new password of the user
   * @returns Promise<StrapiAuthenticationResponse>
   */
  public async changePassword(
    data: StrapiChangePasswordData
  ): Promise<StrapiAuthenticationResponse> {
    const { user, jwt }: StrapiAuthenticationResponse =
      await this.request<StrapiAuthenticationResponse>(
        "post",
        "/auth/change-password",
        {
          data,
        }
      );
    this.setToken(jwt);
    this.user = user;
    return { jwt, user };
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
    this.user = user;
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
    return joinURL(this.options.url, this.options.prefix, "connect", provider);
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
    this.user = user;
    return { user, jwt };
  }

  /**
   * Logout by removing authentication token
   *
   * @returns void
   */
  public logout(): void {
    this.user = null;
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
   * Refresh local data of the logged-in user
   *
   * @returns Promise<StrapiUser>
   */
  public async fetchUser(): Promise<StrapiUser> {
    try {
      const user = await this.request<StrapiUser>("get", "/users/me");
      this.user = user;
    } catch (e) {
      this.logout();
    }

    return this.user;
  }

  /**
   * Retrieve token from chosen storage
   *
   * @returns string | null
   */
  public getToken(): string | null {
    const { useLocalStorage, key } = this.options.store;
    if (isBrowser()) {
      const token = useLocalStorage
        ? window.localStorage.getItem(key)
        : (Cookies.get(key) as string);

      if (typeof token === "undefined") return null;

      return token;
    }

    return null;
  }

  /**
   * Set token in chosen storage
   *
   * @param  {string} token - Token retrieve from login or register method
   * @returns void
   */
  public setToken(token: string): void {
    const { useLocalStorage, key, cookieOptions } = this.options.store;
    if (isBrowser()) {
      useLocalStorage
        ? window.localStorage.setItem(key, token)
        : Cookies.set(key, token, cookieOptions);
    }
  }

  /**
   * Remove token from chosen storage (Cookies or Local)
   *
   * @returns void
   */
  public removeToken(): void {
    const { useLocalStorage, key } = this.options.store;
    if (isBrowser()) {
      useLocalStorage
        ? window.localStorage.removeItem(key)
        : Cookies.remove(key);
    }
  }
}
