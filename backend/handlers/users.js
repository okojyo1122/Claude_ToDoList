'use strict';

const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  ListGroupsCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const cognitoClient = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
    body: JSON.stringify(body),
  };
}

function formatUser(user) {
  const attrs = {};
  (user.Attributes ?? []).forEach(a => { attrs[a.Name] = a.Value; });
  return {
    userId: attrs.sub,
    email: attrs.email,
    name: attrs.name ?? attrs.email,
    username: user.Username,
    status: user.UserStatus,
  };
}

exports.handler = async (event) => {
  try {
    const path = event.path;
    const { teamId } = event.pathParameters ?? {};

    // GET /teams
    if (path.endsWith('/teams') && !teamId) {
      const result = await cognitoClient.send(new ListGroupsCommand({ UserPoolId: USER_POOL_ID }));
      const teams = (result.Groups ?? [])
        .filter(g => g.GroupName !== 'admin')
        .map(g => ({ teamId: g.GroupName, name: g.GroupName, description: g.Description }));
      return response(200, { teams });
    }

    // GET /teams/{teamId}/members
    if (teamId) {
      const result = await cognitoClient.send(new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: teamId,
      }));
      const users = (result.Users ?? []).map(formatUser);
      return response(200, { users });
    }

    // GET /users
    const result = await cognitoClient.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));
    const users = (result.Users ?? []).map(formatUser);
    return response(200, { users });
  } catch (err) {
    console.error(err);
    return response(500, { message: 'Internal Server Error', detail: err.message });
  }
};
