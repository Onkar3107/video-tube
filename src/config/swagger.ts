import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'VideoTube API',
    version: '1.0.0',
    description: 'Production-ready YouTube-clone backend API',
    contact: { name: 'VideoTube Team' },
  },
  servers: [
    { url: '/api/v1', description: 'Development' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'accessToken' },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer' },
          success: { type: 'boolean' },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  paths: {
    '/health-check': {
      get: {
        tags: ['Health'],
        summary: 'Health check endpoint',
        responses: {
          200: { description: 'Server is healthy' },
        },
      },
    },
    '/users/register': {
      post: {
        tags: ['Users'],
        summary: 'Register a new user',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['username', 'email', 'password', 'fullName', 'avatar'],
                properties: {
                  username: { type: 'string', minLength: 3, maxLength: 30 },
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', minLength: 8 },
                  fullName: { type: 'string', minLength: 2 },
                  avatar: { type: 'string', format: 'binary' },
                  coverImage: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'User registered successfully' },
          409: { description: 'Username or email already exists' },
          422: { description: 'Validation error' },
        },
      },
    },
    '/users/login': {
      post: {
        tags: ['Users'],
        summary: 'Login with email/username and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  username: { type: 'string' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Login successful, returns access and refresh tokens' },
          401: { description: 'Invalid credentials' },
          404: { description: 'User not found' },
        },
      },
    },
    '/videos': {
      get: {
        tags: ['Videos'],
        summary: 'Get all videos with pagination and search',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10, maximum: 50 } },
          { name: 'query', in: 'query', schema: { type: 'string' } },
          { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['createdAt', 'views', 'duration'] } },
          { name: 'sortType', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
          { name: 'userId', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Paginated video list' },
        },
      },
    },
  },
};

export function setupSwagger(app: Express): void {
  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerDocument, {
      customSiteTitle: 'VideoTube API Docs',
      swaggerOptions: { persistAuthorization: true },
    }),
  );
}
