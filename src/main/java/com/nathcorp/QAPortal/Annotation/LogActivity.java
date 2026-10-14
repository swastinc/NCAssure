package com.nathcorp.QAPortal.Annotation;

import java.lang.annotation.*;

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
public @interface LogActivity {
    String action();
}