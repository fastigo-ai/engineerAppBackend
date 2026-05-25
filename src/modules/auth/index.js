import adminRoutes from './admin/admin.routes.js';
import engineerRoutes from './engineer/engineer.routes.js';
import userRoutes from './user/user.routes.js';

export {
  adminRoutes as adminAuthRoutes,
  engineerRoutes as engineerAuthRoutes,
  userRoutes as userAuthRoutes
};
