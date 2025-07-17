class ApiResponse {
  static success(res, message = "Success", data = null, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static created(res, message = "Created successfully", data = null) {
    return this.success(res, message, data, 201);
  }

  static error(
    res,
    message = "An error occurred",
    statusCode = 500,
    data = null
  ) {
    return res.status(statusCode).json({
      success: false,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static badRequest(res, message = "Bad request", errors = null) {
    return res.status(400).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  static unauthorized(res, message = "Unauthorized access") {
    return res.status(401).json({
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  static forbidden(res, message = "Access forbidden") {
    return res.status(403).json({
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  static notFound(res, message = "Resource not found") {
    return res.status(404).json({
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  static validationError(res, message = "Validation failed", errors = []) {
    return res.status(422).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
    });
  }

  static rateLimited(res, message = "Too many requests") {
    return res.status(429).json({
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}

module.exports = { ApiResponse };
