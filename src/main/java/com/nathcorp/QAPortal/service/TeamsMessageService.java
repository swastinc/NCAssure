package com.nathcorp.QAPortal.service;

import com.microsoft.graph.models.BodyType;
import com.microsoft.graph.models.Channel;
import com.microsoft.graph.models.ChannelCollectionResponse;
import com.microsoft.graph.models.ChatMessage;
import com.microsoft.graph.models.ItemBody;
import com.microsoft.graph.models.Team;
import com.microsoft.graph.models.TeamCollectionResponse;
import com.microsoft.graph.serviceclient.GraphServiceClient;
import com.microsoft.graph.teams.item.channels.ChannelsRequestBuilder;
import com.microsoft.graph.users.item.joinedteams.JoinedTeamsRequestBuilder;
import com.nathcorp.QAPortal.dto.TeamWithChannelsResponse;
import com.nathcorp.QAPortal.dto.TeamsChannelInfo;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

@Service
public class TeamsMessageService {

    private final GraphServiceClient graphClient;

    public TeamsMessageService(GraphServiceClient graphClient) {
        this.graphClient = graphClient;
    }

    public ChatMessage sendMessageToChannel(String teamId, String channelId, String message) {
        ChatMessage chatMessage = new ChatMessage();

        ItemBody body = new ItemBody();
        body.setContentType(BodyType.Text); // or BodyType.HTML
        body.setContent(message);

        chatMessage.setBody(body);

        return graphClient
                .teams()
                .byTeamId(teamId)
                .channels()
                .byChannelId(channelId)
                .messages()
                .post(chatMessage);
    }

    // Delegated-safe: returns ONLY teams the signed-in user has joined + their channels
    public List<TeamWithChannelsResponse> getAllTeamsWithChannels() {
        List<TeamWithChannelsResponse> result = new ArrayList<>();

        TeamCollectionResponse teamsPage = graphClient
                .me()
                .joinedTeams()
                .get(cfg -> cfg.queryParameters.select = new String[]{"id", "displayName"});

        while (teamsPage != null && teamsPage.getValue() != null) {

            for (Team team : teamsPage.getValue()) {
                String teamId = team.getId();
                String teamName = team.getDisplayName();

                List<TeamsChannelInfo> channelDtos = new ArrayList<>();

                ChannelCollectionResponse channelsPage = graphClient
                        .teams()
                        .byTeamId(teamId)
                        .channels()
                        .get(cfg -> cfg.queryParameters.select = new String[]{"id", "displayName"});

                while (channelsPage != null && channelsPage.getValue() != null) {
                    for (Channel c : channelsPage.getValue()) {
                        channelDtos.add(new TeamsChannelInfo(c.getId(), c.getDisplayName()));
                    }

                    String nextChannels = channelsPage.getOdataNextLink();
                    if (nextChannels == null || nextChannels.isBlank()) break;

                    channelsPage = new ChannelsRequestBuilder(nextChannels, graphClient.getRequestAdapter())
                            .get();
                }

                result.add(new TeamWithChannelsResponse(teamId, teamName, channelDtos));
            }

            String nextTeams = teamsPage.getOdataNextLink();
            if (nextTeams == null || nextTeams.isBlank()) break;

            teamsPage = new JoinedTeamsRequestBuilder(nextTeams, graphClient.getRequestAdapter())
                    .get();
        }

        return result;
    }
}
