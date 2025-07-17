const logger = require("../utils/logger");
const { ApiResponse } = require("../utils/apiResponse");

// Custom error class
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";

    Error.captureStackTrace(this, this.constructor);
  }
}

// Handle Mongoose validation errors
const handleValidationError = (err) => {
  const errors = Object.values(err.errors).map((val) => ({
    field: val.path,
    message: val.message,
  }));

  return new AppError("Validation Error", 400);
};

// Handle Mongoose duplicate key errors
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  return new AppError(`${field} '${value}' already exists`, 400);
};

// Handle Mongoose cast errors
const handleCastError = (err) => {
  return new AppError(`Invalid ${err.path}: ${err.value}`, 400);
};

// Handle JWT errors
const handleJWTError = () => {
  return new AppError("Invalid token. Please log in again.", 401);
};

const handleJWTExpiredError = () => {
  return new AppError("Your token has expired. Please log in again.", 401);
};

// Send error response for development
const sendErrorDev = (err, res) => {
  ApiResponse.error(res, err.message, err.statusCode, {
    error: err,
    stack: err.stack,
  });
};

// Send error response for production
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    ApiResponse.error(res, err.message, err.statusCode);
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error("ERROR 💥", err);
    ApiResponse.error(res, "Something went wrong!", 500);
  }
};

// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(err);

  // Mongoose bad ObjectId
  if (err.name === "CastError") {
    error = handleCastError(error);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    error = handleDuplicateKeyError(error);
  }

  // Mongoose validation error
  if (err.name === "ValidationError") {
    error = handleValidationError(error);
  }

  // JWT error
  if (err.name === "JsonWebTokenError") {
    error = handleJWTError();
  }

  // JWT expired error
  if (err.name === "TokenExpiredError") {
    error = handleJWTExpiredError();
  }

  // Send error response
  if (process.env.NODE_ENV === "development") {
    sendErrorDev(error, res);
  } else {
    sendErrorProd(error, res);
  }
};

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  errorHandler,
  asyncHandler,
};
