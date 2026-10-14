package com.nathcorp.QAPortal.dto;

import java.util.List;

public class TeamWithChannelsResponse {

    private String teamId;
    private String teamName;
    private List<TeamsChannelInfo> channels;

    public TeamWithChannelsResponse() {
    }

    public TeamWithChannelsResponse(String teamId, String teamName, List<TeamsChannelInfo> channels) {
        this.teamId = teamId;
        this.teamName = teamName;
        this.channels = channels;
    }

    public String getTeamId() {
        return teamId;
    }

    public void setTeamId(String teamId) {
        this.teamId = teamId;
    }

    public String getTeamName() {
        return teamName;
    }

    public void setTeamName(String teamName) {
        this.teamName = teamName;
    }

    public List<TeamsChannelInfo> getChannels() {
        return channels;
    }

    public void setChannels(List<TeamsChannelInfo> channels) {
        this.channels = channels;
    }
}
