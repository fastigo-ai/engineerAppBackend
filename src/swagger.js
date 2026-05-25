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
    { name: 'Notification', description: 'Push notification controls' },
    { name: 'Finance Payments', description: 'Payment processing and webhooks' },
    { name: 'Map', description: 'Geolocation and routing' },
    { name: 'Engineer Profile', description: 'Engineer profile and management' },
    { name: 'Engineer Location', description: 'Location and online status' },
    { name: 'Engineer Requests', description: 'Standard service requests' },
    { name: 'Engineer Vendor Requests', description: 'B2B vendor orders' },
    { name: 'Engineer Finance', description: 'Earnings and bank account' }
  ]
};

const outputFile = './src/config/swagger_output.json';
const endpointsFiles = ['./src/swagger-endpoints.js'];

// Generate swagger_output.json
swaggerAutogen({ openapi: '3.0.0' })(outputFile, endpointsFiles, doc).then(({ data }) => {
  // Post-process the generated JSON to add tags based on URL paths
  for (const path in data.paths) {
    for (const method in data.paths[path]) {
      if (path.startsWith('/api/auth')) {
        data.paths[path][method].tags = ['Auth User'];
      } else if (path.startsWith('/api/engineer/auth')) {
        data.paths[path][method].tags = ['Auth Engineer'];
      } else if (path.startsWith('/api/admin/auth')) {
        data.paths[path][method].tags = ['Auth Admin'];
      } else if (path.startsWith('/api/services/category') || path.startsWith('/api/services/categories')) {
        data.paths[path][method].tags = ['Catalog Categories'];
      } else if (path.startsWith('/api/services/plan')) {
        data.paths[path][method].tags = ['Catalog Plans'];
      } else if (path.startsWith('/api/services')) {
        data.paths[path][method].tags = ['Catalog Services'];
      } else if (path.startsWith('/api/notification')) {
        data.paths[path][method].tags = ['Notification'];
      } else if (path.startsWith('/api/payment')) {
        data.paths[path][method].tags = ['Finance Payments'];
      } else if (path.startsWith('/api/map')) {
        data.paths[path][method].tags = ['Map'];
      } else if (path.startsWith('/api/engineer/requests')) {
        data.paths[path][method].tags = ['Engineer Requests'];
      } else if (path.startsWith('/api/engineer/vendorOrder')) {
        data.paths[path][method].tags = ['Engineer Vendor Requests'];
      } else if (path.startsWith('/api/engineer/wallet') || path.startsWith('/api/engineer/withdraw') || path.startsWith('/api/engineer/bank-account') || path.startsWith('/api/engineer/earnings') || path.startsWith('/api/engineer/transactions')) {
        data.paths[path][method].tags = ['Engineer Finance'];
      } else if (path.startsWith('/api/engineer/goOnline') || path.startsWith('/api/engineer/goOffline') || path.startsWith('/api/engineer/heartbeat') || path.startsWith('/api/engineer/updateLocation') || path.startsWith('/api/engineer/update/location')) {
        data.paths[path][method].tags = ['Engineer Location'];
      } else if (path.startsWith('/api/engineer')) {
        data.paths[path][method].tags = ['Engineer Profile'];
      } else if (path.startsWith('/api/admin')) {
        data.paths[path][method].tags = ['Admin'];
      } else if (path.startsWith('/api/coupon')) {
        data.paths[path][method].tags = ['Coupon'];
      }
    }
  }
  
  import('fs').then(fs => {
    fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
    console.log('Swagger documentation updated with tags!');
  });
});
