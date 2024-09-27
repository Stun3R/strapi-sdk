import Strapi from "../../src";
import sinon from "sinon";
import Cookies from "js-cookie";
import { StrapiError } from "../../src";
import { AxiosError } from "axios";
import { joinURL } from "ufo";

interface TestContext {
  strapi: Strapi;
  axiosRequest: sinon.SinonStub;
}

describe("Strapi SDK", () => {
  let context: TestContext;

  beforeEach(() => {
    const strapi = new Strapi({
      url: "http://strapi-host/",
      axiosOptions: {},
    });

    context = {
      strapi,
      axiosRequest: sinon.stub(strapi.axios, "request").resolves({
        data: {},
      }),
    };
  });

  describe("Axios request", () => {
    test("Basic Axios Request", async () => {
      await context.strapi.request("get", "/users", {
        params: {
          sort: "username",
        },
      });

      expect(
        context.axiosRequest.calledWithExactly({
          method: "get",
          url: "/users",
          params: {
            sort: "username",
          },
        })
      );
    });

    test("Request with custom axios config", async () => {
      await context.strapi.request("get", "/users", {
        headers: {
          Authorization: "Bearer jwt",
        },
      });

      expect(
        context.axiosRequest.calledWithExactly({
          headers: {
            Authorization: "Bearer jwt",
          },
          method: "get",
          url: "/users",
        })
      ).toBe(true);
    });
  });

  describe("Catch Strapi error request", () => {
    test("Basic error", async () => {
      context.axiosRequest.rejects({
        response: {
          data: {
            data: null,
            error: {
              status: 404,
              name: "NotFoundError",
              message: "Not Found",
              details: {},
            },
          },
        },
      });

      let response: AxiosError<StrapiError> | null = null;
      try {
        await context.strapi.request("get", "/users");
      } catch (error) {
        const e = error as AxiosError<StrapiError>;
        response = e;
      }

      expect(response).toMatchObject({
        data: null,
        error: {
          status: 404,
          name: "NotFoundError",
          message: "Not Found",
          details: {},
        },
      });
    });
  });

  test("Catch Network error request", async () => {
    context.axiosRequest.rejects(new Error("Network Error"));

    let response: StrapiError = {
      data: null,
      error: { status: 0, name: "", message: "", details: {} },
    };
    try {
      await context.strapi.request("get", "/users");
    } catch (error) {
      const e = error as StrapiError;
      response = e;
    }

    expect(response).toMatchObject({
      data: null,
      error: {
        status: 500,
        name: "UnknownError",
        message: "Network Error",
        details: response.error.details || {},
      },
    });
  });

  describe("Users & Permissions", () => {
    test("Fetch user", async () => {
      context.axiosRequest.resolves({
        data: {
          username: "John Doe",
          email: "john@doe.com",
        },
      });

      await context.strapi.fetchUser();

      expect(
        context.axiosRequest.calledWith({
          method: "get",
          url: "/users/me",
        })
      ).toBe(true);

      expect(context.strapi.user).toEqual({
        username: "John Doe",
        email: "john@doe.com",
      });
    });

    test("Catch error on Fetch user", async () => {
      context.axiosRequest.rejects({
        response: {
          status: "401",
          statusText: "Unauthorized",
          data: {
            message: "Unauthorized",
          },
        },
      });

      await context.strapi.fetchUser();

      expect(
        context.axiosRequest.calledWith({
          method: "get",
          url: "/users/me",
        })
      ).toBe(true);

      expect(context.strapi.user).toBe(null);
      expect(
        context.strapi.axios.defaults.headers.common["Authorization"]
      ).toBe(undefined);
    });

    test("Register", async () => {
      context.axiosRequest.resolves({
        data: {
          user: {
            username: "John Doe",
            email: "john@doe.com",
          },
          jwt: "XXX",
        },
      });

      const response = await context.strapi.register({
        email: "john@doe.com",
        username: "John Doe",
        password: "password",
      });

      expect(
        context.axiosRequest.calledWith({
          method: "post",
          url: "/auth/local/register",
          data: {
            email: "john@doe.com",
            username: "John Doe",
            password: "password",
          },
        })
      ).toBe(true);

      expect(response).toEqual({
        user: {
          username: "John Doe",
          email: "john@doe.com",
        },
        jwt: "XXX",
      });

      expect(context.strapi.getToken()).toBe("XXX");

      expect(context.strapi.user).toStrictEqual({
        username: "John Doe",
        email: "john@doe.com",
      });

      context.strapi.removeToken();
      context.strapi.user = null;
    });

    test("Login", async () => {
      context.axiosRequest.resolves({
        data: {
          user: {
            username: "John Doe",
            email: "john@doe.com",
          },
          jwt: "XXX",
        },
      });

      const response = await context.strapi.login({
        identifier: "john@doe.com",
        password: "password",
      });

      expect(
        context.axiosRequest.calledWith({
          method: "post",
          url: "/auth/local",
          data: {
            identifier: "john@doe.com",
            password: "password",
          },
        })
      ).toBe(true);

      expect(response).toEqual({
        user: {
          username: "John Doe",
          email: "john@doe.com",
        },
        jwt: "XXX",
      });

      expect(context.strapi.getToken()).toBe("XXX");

      expect(context.strapi.user).toStrictEqual({
        username: "John Doe",
        email: "john@doe.com",
      });

      context.strapi.removeToken();
      context.strapi.user = null;
    });

    test("Change Password", async () => {
      await context.strapi.changePassword({
        currentPassword: "password",
        password: "newPassword",
        passwordConfirmation: "newPassword",
      });
      expect(
        context.axiosRequest.calledWith({
          method: "post",
          url: "/auth/change-password",
          data: {
            currentPassword: "password",
            password: "newPassword",
            passwordConfirmation: "newPassword",
          },
        })
      ).toBe(true);
    });

    test("Forgot Password", async () => {
      await context.strapi.forgotPassword({
        email: "john@doe.com",
      });

      expect(
        context.axiosRequest.calledWith({
          method: "post",
          url: "/auth/forgot-password",
          data: {
            email: "john@doe.com",
          },
        })
      ).toBe(true);
    });

    test("Reset Password", async () => {
      context.axiosRequest.resolves({
        data: {
          user: {},
          jwt: "XXX",
        },
      });

      const response = await context.strapi.resetPassword({
        code: "XXX",
        password: "password",
        passwordConfirmation: "password",
      });

      expect(
        context.axiosRequest.calledWith({
          method: "post",
          url: "/auth/reset-password",
          data: {
            code: "XXX",
            password: "password",
            passwordConfirmation: "password",
          },
        })
      ).toBe(true);

      expect(response).toEqual({ user: {}, jwt: "XXX" });

      expect(context.strapi.getToken()).toEqual("XXX");
      context.strapi.removeToken();
      context.strapi.user = null;
    });

    test("Send Email Confirmation", async () => {
      await context.strapi.sendEmailConfirmation({
        email: "john@doe.com",
      });

      expect(
        context.axiosRequest.calledWith({
          method: "post",
          url: "/auth/send-email-confirmation",
          data: {
            email: "john@doe.com",
          },
        })
      ).toBe(true);
    });

    test("Get Authentication Provider", () => {
      const url = context.strapi.getProviderAuthenticationUrl("github");

      expect(url).toBe(
        joinURL(
          context.strapi.options.url,
          context.strapi.options.prefix,
          "connect/github"
        )
      );
    });

    test("Authentication with third party token", async () => {
      context.axiosRequest.resolves({
        data: {
          user: {},
          jwt: "XXX",
        },
      });

      const response = await context.strapi.authenticateProvider(
        "github",
        "myAccessToken"
      );

      expect(
        context.axiosRequest.calledWith({
          method: "get",
          url: "/auth/github/callback",
          params: {
            access_token: "myAccessToken",
          },
        })
      ).toBe(true);

      expect(response).toEqual({ user: {}, jwt: "XXX" });
      expect(context.strapi.getToken()).toEqual("XXX");

      context.strapi.removeToken();
      context.strapi.user = null;
    });

    test("Authentication with third party token on searchParams", async () => {
      Object.defineProperty(window, "location", {
        value: {
          search: "?access_token=myAccessToken",
        },
      });

      context.axiosRequest.resolves({
        data: {
          user: {},
          jwt: "XXX",
        },
      });

      const response = await context.strapi.authenticateProvider("github");

      expect(
        context.axiosRequest.calledWith({
          method: "get",
          url: "/auth/github/callback",
          params: {
            access_token: "myAccessToken",
          },
        })
      ).toBe(true);

      expect(response).toEqual({ user: {}, jwt: "XXX" });
      expect(context.strapi.getToken()).toEqual("XXX");

      context.strapi.removeToken();
      context.strapi.user = null;
    });

    test("Logout", async () => {
      context.axiosRequest.resolves({
        data: {
          user: {},
          jwt: "XXX",
        },
      });

      await context.strapi.login({
        identifier: "john@doe.com",
        password: "password",
      });
      context.strapi.logout();

      expect(context.strapi.getToken()).toBe(null);
    });
  });

  describe("Token Management", () => {
    test("Get Token in non DOM env", () => {
      const windowSpy = jest.spyOn(window, "window", "get");
      // @ts-ignore
      windowSpy.mockImplementation(() => undefined);

      expect(context.strapi.getToken()).toBe(null);

      windowSpy.mockRestore();
    });

    test("Get Token from Cookies", () => {
      Cookies.set("strapi_jwt", "XXX");

      expect(context.strapi.getToken()).toBe("XXX");

      Cookies.remove("strapi_jwt");
    });

    test("Get Token from localStorage", () => {
      context.strapi.options.store.useLocalStorage = true;
      window.localStorage.setItem("strapi_jwt", "XXX");

      expect(context.strapi.getToken()).toBe("XXX");

      window.localStorage.removeItem("strapi_jwt");
      context.strapi.options.store.useLocalStorage = false;
    });

    test("Set Token in Cookies", () => {
      context.strapi.setToken("XXX");

      expect(Cookies.get("strapi_jwt")).toBe("XXX");

      Cookies.remove("strapi_jwt");
    });

    test("Set Token in localStorage", () => {
      context.strapi.options.store.useLocalStorage = true;
      context.strapi.setToken("XXX");

      expect(window.localStorage.getItem("strapi_jwt")).toBe("XXX");

      window.localStorage.removeItem("strapi_jwt");
      context.strapi.options.store.useLocalStorage = false;
    });

    test("Remove Token in Cookies", () => {
      context.strapi.setToken("XXX");
      context.strapi.removeToken();

      expect(Cookies.get("strapi_jwt")).toBe(undefined);
    });

    test("Remove Token in localStorage", () => {
      context.strapi.options.store.useLocalStorage = true;
      context.strapi.setToken("XXX");
      context.strapi.removeToken();

      expect(window.localStorage.getItem("strapi_jwt")).toBe(null);
    });
  });

  describe("Entries", () => {
    test("find - Get a list of {content-type} entries", async () => {
      await context.strapi.find("restaurants", {
        sort: "name",
      });

      expect(
        context.axiosRequest.calledWith({
          method: "get",
          params: {
            sort: "name",
          },
          url: "/restaurants",
        })
      ).toBe(true);
    });

    test("findOne - Get a specific {content-type} entry", async () => {
      await context.strapi.findOne("restaurants", '1', {
        fields: ["name"],
      });

      expect(
        context.axiosRequest.calledWithExactly({
          method: "get",
          url: "/restaurants/1",
          params: {
            fields: ["name"],
          },
        })
      ).toBe(true);
    });

    test("create - Create a {content-type} entry", async () => {
      await context.strapi.create(
        "restaurants",
        {
          name: "La Fourchette",
        },
        { fields: ["id", "name"] }
      );

      expect(
        context.axiosRequest.calledWithExactly({
          method: "post",
          url: "/restaurants",
          data: {
            data: {
              name: "La Fourchette",
            },
          },
          params: {
            fields: ["id", "name"],
          },
        })
      ).toBe(true);
    });

    test("update - Update a {content-type} entry", async () => {
      await context.strapi.update(
        "restaurants",
        '1',
        {
          username: "La Fourchette",
        },
        { fields: ["name"] }
      );

      expect(
        context.axiosRequest.calledWithExactly({
          method: "put",
          url: "/restaurants/1",
          data: {
            data: {
              username: "La Fourchette",
            },
          },
          params: {
            fields: ["name"],
          },
        })
      ).toBe(true);
    });

    test("delete - Delete a {content-type} entry", async () => {
      await context.strapi.delete("restaurants", 1, { fields: ["name"] });

      expect(
        context.axiosRequest.calledWithExactly({
          method: "delete",
          url: "/restaurants/1",
          params: {
            fields: ["name"],
          },
        })
      ).toBe(true);
    });
  });
});
