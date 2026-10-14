package com.nathcorp.QAPortal.ex;

public class BuildAlreadyExistsException extends RuntimeException {

    public BuildAlreadyExistsException(String message) {
        super(message);
    }
}