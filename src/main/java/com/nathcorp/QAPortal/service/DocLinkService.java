package com.nathcorp.QAPortal.service;

import java.util.List;

public interface DocLinkService {
    List<String> getSharePointLinks(String project, String version);
}
