/**
 * Wraps an async function to catch errors and pass them to the next middleware.
 * Eliminates the need for try/catch blocks in every controller.
 */
export const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};
