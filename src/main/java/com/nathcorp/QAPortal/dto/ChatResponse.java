package com.nathcorp.QAPortal.dto;

public class ChatResponse {

    private String type; // TEXT | BUG_LIST | BUILD_CARD
    private String text;
    private Object data;

//    public static ChatResponse text(String msg) {
//        return new ChatResponse("TEXT", msg, null);
//    }

 }
