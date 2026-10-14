package com.nathcorp.QAPortal.dto;

public class UploadResponse {
    private String fileId;
    private String fileName;

    public UploadResponse() {}
    public UploadResponse(String fileId, String fileName) {
        this.fileId = fileId;
        this.fileName = fileName;
    }

    public String getFileId() { return fileId; }
    public void setFileId(String fileId) { this.fileId = fileId; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
}
