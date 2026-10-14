package com.nathcorp.QAPortal.ex;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.context.request.async.AsyncRequestTimeoutException;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * An SSE client closing its browser, navigating away, or reconnecting can
     * abort the servlet output stream. The response is already committed as
     * text/event-stream, so attempting to write a JSON ErrorResponse would
     * cause an additional message-converter failure.
     */
    @ExceptionHandler({
            AsyncRequestNotUsableException.class,
            AsyncRequestTimeoutException.class
    })
    public void handleAsyncStreamClosed(
            Exception ex,
            HttpServletRequest request
    ) {
        log.debug(
                "Async event stream closed on {}: {}",
                request.getRequestURI(),
                ex.getMessage()
        );
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<ErrorResponse> handleUnauthorizedException(
            UnauthorizedException ex,
            HttpServletRequest request
    ) {
        log.warn("Unauthorized request on {}: {}", request.getRequestURI(), ex.getMessage());

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.UNAUTHORIZED.value(),
                HttpStatus.UNAUTHORIZED.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.UNAUTHORIZED);
    }

    @ExceptionHandler(BuildAlreadyExistsException.class)
    public ResponseEntity<ErrorResponse> handleBuildAlreadyExistsException(
            BuildAlreadyExistsException ex,
            HttpServletRequest request
    ) {
        log.warn("Conflict on {}: {}", request.getRequestURI(), ex.getMessage());

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.CONFLICT.value(),
                HttpStatus.CONFLICT.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.CONFLICT);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ErrorResponse> handleMissingRequestParam(
            MissingServletRequestParameterException ex,
            HttpServletRequest request
    ) {
        String message =
                "Missing required request parameter: " + ex.getParameterName();

        log.warn("Bad request on {}: {}", request.getRequestURI(), message);

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                message,
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ErrorResponse> handleMissingRequestHeader(
            MissingRequestHeaderException ex,
            HttpServletRequest request
    ) {
        String message =
                "Missing required request header: " + ex.getHeaderName();

        log.warn("Bad request on {}: {}", request.getRequestURI(), message);

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                message,
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex,
            HttpServletRequest request
    ) {
        String message =
                "Invalid value for parameter: " + ex.getName();

        log.warn("Bad request on {}: {}", request.getRequestURI(), message);

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.BAD_REQUEST.value(),
                HttpStatus.BAD_REQUEST.getReasonPhrase(),
                message,
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(
            ResponseStatusException ex,
            HttpServletRequest request
    ) {
        HttpStatus status =
                ex.getStatusCode() instanceof HttpStatus httpStatus
                        ? httpStatus
                        : HttpStatus.INTERNAL_SERVER_ERROR;

        String message =
                ex.getReason() != null && !ex.getReason().isBlank()
                        ? ex.getReason()
                        : status.getReasonPhrase();

        if (status.is5xxServerError()) {
            log.error("Server error on {}: {}", request.getRequestURI(), message, ex);
        } else {
            log.warn("Request error on {}: {}", request.getRequestURI(), message);
        }

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                status.value(),
                status.getReasonPhrase(),
                message,
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, status);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ErrorResponse> handleRuntimeException(
            RuntimeException ex,
            HttpServletRequest request
    ) {
        log.error("Runtime exception on {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase(),
                ex.getMessage(),
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(
            Exception ex,
            HttpServletRequest request
    ) {
        log.error("Unhandled exception on {}: {}", request.getRequestURI(), ex.getMessage(), ex);

        ErrorResponse errorResponse = new ErrorResponse(
                LocalDateTime.now(),
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase(),
                "Something went wrong.",
                request.getRequestURI()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
