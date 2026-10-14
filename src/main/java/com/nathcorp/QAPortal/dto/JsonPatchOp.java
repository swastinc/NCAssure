// JsonPatchOp.java
package com.nathcorp.QAPortal.dto;

public record JsonPatchOp(
    String op,
    String path,
    Object value
) {}
