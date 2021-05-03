import { Handler } from '@digita-ai/handlersjs-core';
import { of } from 'rxjs';
import { HttpHandler } from '../models/http-handler';
import { HttpHandlerContext } from '../models/http-handler-context';
import { HttpHandlerController } from '../models/http-handler-controller';
import { HttpHandlerRoute } from '../models/http-handler-route';
import { RoutedHttpRequestHandler } from './routed-http-request.handler';

const getMockedHttpHandler = (): HttpHandler => ({
  handle: jest.fn().mockReturnValue(of({ status: 200, headers: {} })),
  canHandle: jest.fn(),
  safeHandle: jest.fn(),
});

const getMockedHttpHandlerAndRoute = (route: string): { handler: HttpHandler; route: HttpHandlerRoute } => {

  const operations = [ { method: 'GET', publish: true } ];
  const handler = getMockedHttpHandler();

  return { handler, route: { path: route, operations, handler } };

};

const getMockPreresponseHandler = () => ({
  handle: jest.fn().mockImplementation((input) => of(input)),
  canHandle: jest.fn(),
  safeHandle: jest.fn(),
} as Handler<HttpHandlerContext, HttpHandlerContext>);

describe('RoutedHttpRequestHandler', () => {

  let routedHttpRequestHandler: RoutedHttpRequestHandler;
  let handlerControllerList: HttpHandlerController[];
  let mockHttpHandler: HttpHandler;
  let preresponseHandler: Handler<HttpHandlerContext, HttpHandlerContext>;

  beforeEach(() => {

    mockHttpHandler = getMockedHttpHandler();
    preresponseHandler = getMockPreresponseHandler();

    handlerControllerList = [
      {
        label: '1',
        preResponseHandler: preresponseHandler,
        routes: [ {
          operations: [ {
            method: 'GET',
            publish: true,
          }, {
            method: 'OPTIONS',
            publish: false,
          } ],
          path: '/path1',
          handler: mockHttpHandler,
        } ],
      },
      {
        label: '2',
        routes: [ {
          operations: [ {
            method: 'POST',
            publish: true,
          },
          {
            method: 'PUT',
            publish: true,
          } ],
          path: '/path2',
          handler: mockHttpHandler,
        } ],
      },
    ];

    routedHttpRequestHandler = new RoutedHttpRequestHandler(handlerControllerList);

  });

  it('should instantiate correctly when passed correct HttpHandlerController[]', () => {

    expect(routedHttpRequestHandler).toBeTruthy();

  });

  it('should throw an error when calling constructor with null', () => {

    expect(() => new RoutedHttpRequestHandler(null)).toThrow('handlerControllerList must be defined.');

  });

  it('should throw an error when calling constructor with undefined', () => {

    expect(() => new RoutedHttpRequestHandler(undefined)).toThrow('handlerControllerList must be defined.');

  });

  describe('handle', () => {

    it('should call the handle function of the handler in the HttpHandlerRoute when the requested route exists', async () => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/path1', 'http://example.com'), method: 'GET', headers: {} },
      };

      await routedHttpRequestHandler.handle(httpHandlerContext).toPromise();
      expect(mockHttpHandler.handle).toHaveBeenCalledTimes(1);

    });

    it('should return a 404 response when the path does not exist', async () => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/nonExistantPath', 'http://example.com'), method: 'GET', headers: {} },
      };

      await expect(routedHttpRequestHandler.handle(httpHandlerContext).toPromise())
        .resolves.toEqual(expect.objectContaining({ status: 404 }));

    });

    it('should return a 405 response when the path exists, but the method does not match ', async () => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/path2', 'http://example.com'), method: 'GET', headers: {} },
      };

      const response = routedHttpRequestHandler.handle(httpHandlerContext).toPromise();
      await expect(response).resolves.toEqual(expect.objectContaining({ status: 405 }));
      await expect(response).resolves.toEqual(expect.objectContaining({ headers: { Allow: 'POST, PUT' } }));

    });

    it('should throw an error when called with null or undefined', async () => {

      await expect(routedHttpRequestHandler.handle(null).toPromise())
        .rejects.toThrow('context must be defined.');

      await expect(routedHttpRequestHandler.handle(undefined).toPromise())
        .rejects.toThrow('context must be defined.');

    });

    it('should throw an error when called with a request that is null or undefined', async () => {

      const httpHandlerContext1: HttpHandlerContext = {
        request: null,
      };

      await expect(routedHttpRequestHandler.handle(httpHandlerContext1).toPromise())
        .rejects.toThrow('context.request must be defined.');

      const httpHandlerContext2: HttpHandlerContext = {
        request: undefined,
      };

      await expect(routedHttpRequestHandler.handle(httpHandlerContext2).toPromise())
        .rejects.toThrow('context.request must be defined.');

    });

    it('should parse url parameters correctly', async() => {

      const { handler: oneDynamicHandler, route: oneDynamicRoute } = getMockedHttpHandlerAndRoute('/one/:dynamic');
      const { handler: dynamicOneHandler, route: dynamicOneRoute } = getMockedHttpHandlerAndRoute('/:dynamic/one');
      const { handler: neverHandler, route: neverRoute } = getMockedHttpHandlerAndRoute('/never');

      routedHttpRequestHandler = new RoutedHttpRequestHandler([
        { label: 'testRoutes', routes: [ oneDynamicRoute, dynamicOneRoute, neverRoute ] },
      ]);

      const pathsAndRoutes = {
        '/one/dynamicParam': oneDynamicHandler,
        '/dynamicParam/one': dynamicOneHandler,
      };

      Object.keys(pathsAndRoutes).forEach(async (key) => {

        const ctx: HttpHandlerContext = { request: { url: new URL(key, 'http://example.com'), method: 'GET', headers: {} } };
        await routedHttpRequestHandler.handle(ctx).toPromise();

      });

      Object.entries(pathsAndRoutes).forEach(([ key, value ]) => {

        expect(value.handle).toHaveBeenCalledTimes(1);

        expect(value.handle).toHaveBeenCalledWith(
          expect.objectContaining({
            request: {
              parameters: { dynamic: 'dynamicParam' },
              headers: {},
              url: new URL(key, 'http://example.com'),
              method: 'GET',
            },
          }),
        );

      });

      expect(neverHandler.handle).toHaveBeenCalledTimes(0);

    });

    it('should call the right handler depending on the path', async() => {

      const { handler: oneHandler, route: oneRoute } = getMockedHttpHandlerAndRoute('/one');
      const { handler: twoHandler, route: twoRoute } = getMockedHttpHandlerAndRoute('/two');
      const { handler: nestedOneHandler, route: nestedOneRoute } = getMockedHttpHandlerAndRoute('/nested/one');
      const { handler: nestedNestedOneHandler, route: nestedNestedOneRoute } = getMockedHttpHandlerAndRoute('/nested/nested/one');
      const { handler: nestedTwoHandler, route: nestedTwoRoute } = getMockedHttpHandlerAndRoute('/nested/two');
      const { handler: oneDynamicHandler, route: oneDynamicRoute } = getMockedHttpHandlerAndRoute('/one/:dynamic');
      const { handler: dynamicOneHandler, route: dynamicOneRoute } = getMockedHttpHandlerAndRoute('/:dynamic/one');
      const { handler: neverHandler, route: neverRoute } = getMockedHttpHandlerAndRoute('/never');

      routedHttpRequestHandler = new RoutedHttpRequestHandler([
        {
          label: 'testRoutes',
          routes: [
            oneRoute,
            twoRoute,
            nestedOneRoute,
            nestedNestedOneRoute,
            nestedTwoRoute,
            oneDynamicRoute,
            dynamicOneRoute,
            neverRoute,
          ],
        },
      ]);

      const pathsAndRoutes = {
        '/one': oneHandler,
        '/two': twoHandler,
        '/nested/one': nestedOneHandler,
        '/nested/nested/one': nestedNestedOneHandler,
        '/nested/two': nestedTwoHandler,
        '/one/dynamicParam': oneDynamicHandler,
        '/dynamicParam/one': dynamicOneHandler,
      };

      Object.keys(pathsAndRoutes).forEach(async (key) => {

        const ctx: HttpHandlerContext = { request: { url: new URL(key, 'http://example.com'), method: 'GET', headers: {} } };
        await routedHttpRequestHandler.handle(ctx).toPromise();

      });

      Object.entries(pathsAndRoutes).forEach(([ key, value ]) => {

        expect(value.handle).toHaveBeenCalledTimes(1);

      });

      expect(neverHandler.handle).toHaveBeenCalledTimes(0);

    });

    it('should call the preresponse handler if present', async() => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/path1', 'http://example.com'), method: 'GET', headers: {} },
      };

      await routedHttpRequestHandler.handle(httpHandlerContext).toPromise();
      expect(preresponseHandler.handle).toHaveBeenCalledTimes(1);
      expect(mockHttpHandler.handle).toHaveBeenCalledTimes(1);

    });

    it('should pass the original context to the handler when the preResponseHandler does nothing', async() => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/path1', 'http://example.com'), method: 'GET', headers: {} },
      };

      await routedHttpRequestHandler.handle(httpHandlerContext).toPromise();
      expect(preresponseHandler.handle).toHaveBeenCalledTimes(1);

      expect(preresponseHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ request: httpHandlerContext.request }),
      );

      expect(mockHttpHandler.handle).toHaveBeenCalledTimes(1);

      expect(mockHttpHandler.handle).toHaveBeenCalledWith(
        expect.objectContaining({ request: httpHandlerContext.request }),
      );

    });

    it('should add allow headers to the response when request method is OPTIONS', async() => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/path1', 'http://example.com'), method: 'OPTIONS', headers: {} },
      };

      const response = await routedHttpRequestHandler.handle(httpHandlerContext).toPromise();
      expect(response.headers).toEqual(expect.objectContaining({ Allow: 'GET, OPTIONS' }));

    });

  });

  describe('canHandle', () => {

    it ('should return true when context and request are defined', async () => {

      const httpHandlerContext: HttpHandlerContext = {
        request: { url: new URL('/path1', 'http://example.com'), method: 'GET', headers: {} },
      };

      await expect(routedHttpRequestHandler.canHandle(httpHandlerContext).toPromise()).resolves.toEqual(true);

    });

    it ('should return false when context is undefined or null', async () => {

      await expect(routedHttpRequestHandler.canHandle(null).toPromise()).resolves.toEqual(false);

      await expect(routedHttpRequestHandler.canHandle(undefined).toPromise()).resolves.toEqual(false);

    });

    it ('should return false when context.request is undefined or null', async () => {

      const httpHandlerContext1: HttpHandlerContext = {
        request: null,
      };

      await expect(routedHttpRequestHandler.canHandle(httpHandlerContext1).toPromise()).resolves.toEqual(false);

      const httpHandlerContext2: HttpHandlerContext = {
        request: undefined,
      };

      await expect(routedHttpRequestHandler.canHandle(httpHandlerContext2).toPromise()).resolves.toEqual(false);

    });

  });

});
