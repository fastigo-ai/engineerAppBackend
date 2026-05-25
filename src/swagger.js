import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'Door2Fy API',
    description: 'API documentation for Door2Fy Refactored Modules (Auth, Catalog, Notification)',
    version: '1.0.0',
  },
  host: 'localhost:8080',
  schemes: ['http'],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      }
    }
  },
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth User', description: 'User authentication and profile' },
    { name: 'Auth Engineer', description: 'Engineer authentication and profile' },
    { name: 'Auth Admin', description: 'Admin authentication' },
    { name: 'Catalog Categories', description: 'Service categories' },
    { name: 'Catalog Plans', description: 'Service plans' },
    { name: 'Catalog Services', description: 'Services available' },
    { name: 'Notification', description: 'Push notification controls' }
  ]
};

const outputFile = './src/config/swagger_output.json';
const endpointsFiles = ['./src/swagger-endpoints.js'];

// Generate swagger_output.json
swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(({ data }) => {
  // Post-process the generated JSON to add tags based on URL paths
  for (const path in data.paths) {
    for (const method in data.paths[path]) {
      if (path.startsWith('/api/auth/user')) {
        data.paths[path][method].tags = ['Auth User'];
      } else if (path.startsWith('/api/auth/engineer')) {
        data.paths[path][method].tags = ['Auth Engineer'];
      } else if (path.startsWith('/api/auth/admin')) {
        data.paths[path][method].tags = ['Auth Admin'];
      } else if (path.startsWith('/api/catalog/categories')) {
        data.paths[path][method].tags = ['Catalog Categories'];
      } else if (path.startsWith('/api/catalog/plans')) {
        data.paths[path][method].tags = ['Catalog Plans'];
      } else if (path.startsWith('/api/catalog/services')) {
        data.paths[path][method].tags = ['Catalog Services'];
      } else if (path.startsWith('/api/notification')) {
        data.paths[path][method].tags = ['Notification'];
      }
    }
  }
  
  import('fs').then(fs => {
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log('Swagger documentation updated with tags!');
  });
});
