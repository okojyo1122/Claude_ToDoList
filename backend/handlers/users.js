'use strict';

const {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  ListGroupsCommand,
  AdminListGroupsForUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
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

function getGroups(claims) {
  const raw = claims?.['cognito:groups'];
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  return [raw];
}

function isAdmin(claims) {
  return getGroups(claims).includes('admin');
}

exports.handler = async (event) => {
  try {
    const path = event.path;
    const method = event.httpMethod;
    const { teamId, userId } = event.pathParameters ?? {};
    const claims = event.requestContext?.authorizer?.claims ?? {};

    // GET /teams
    if (path.endsWith('/teams') && !teamId) {
      const result = await cognitoClient.send(new ListGroupsCommand({ UserPoolId: USER_POOL_ID }));
      const teams = (result.Groups ?? [])
        .filter(g => g.GroupName !== 'admin')
        .map(g => ({ teamId: g.GroupName, name: g.GroupName, description: g.Description }));
      return response(200, { teams });
    }

    // GET /teams/{teamId}/members
    if (teamId && method === 'GET') {
      const result = await cognitoClient.send(new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: teamId,
      }));
      const users = (result.Users ?? []).map(formatUser);
      return response(200, { users });
    }

    // GET /users/{userId}/groups
    if (userId && path.endsWith('/groups') && method === 'GET') {
      const result = await cognitoClient.send(new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      }));
      const groups = (result.Groups ?? []).map(g => g.GroupName);
      return response(200, { groups });
    }

    // PUT /users/{userId}/groups  (管理者のみ)
    if (userId && path.endsWith('/groups') && method === 'PUT') {
      if (!isAdmin(claims)) return response(403, { message: '管理者権限が必要です' });
      const body = JSON.parse(event.body ?? '{}');
      const { groups } = body; // string[]
      if (!Array.isArray(groups)) return response(400, { message: 'groups は配列で指定してください' });

      // 現在のグループを取得
      const current = await cognitoClient.send(new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: userId,
      }));
      const currentGroups = (current.Groups ?? []).map(g => g.GroupName).filter(g => g !== 'admin');

      // 削除対象
      const toRemove = currentGroups.filter(g => !groups.includes(g));
      // 追加対象
      const toAdd = groups.filter(g => g !== 'admin' && !currentGroups.includes(g));

      await Promise.all([
        ...toRemove.map(g => cognitoClient.send(new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID, Username: userId, GroupName: g,
        }))),
        ...toAdd.map(g => cognitoClient.send(new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID, Username: userId, GroupName: g,
        }))),
      ]);
      return response(200, { message: 'グループを更新しました' });
    }

    // PUT /users/{userId}/admin  (管理者のみ・admin グループ付与/剥奪)
    if (userId && path.endsWith('/admin') && method === 'PUT') {
      if (!isAdmin(claims)) return response(403, { message: '管理者権限が必要です' });
      const body = JSON.parse(event.body ?? '{}');
      const cmd = body.isAdmin
        ? new AdminAddUserToGroupCommand({ UserPoolId: USER_POOL_ID, Username: userId, GroupName: 'admin' })
        : new AdminRemoveUserFromGroupCommand({ UserPoolId: USER_POOL_ID, Username: userId, GroupName: 'admin' });
      await cognitoClient.send(cmd);
      return response(200, { message: '管理者権限を更新しました' });
    }

    // GET /users  (全ユーザー + 各自のグループ)
    const result = await cognitoClient.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));
    const users = await Promise.all((result.Users ?? []).map(async u => {
      const base = formatUser(u);
      const grpRes = await cognitoClient.send(new AdminListGroupsForUserCommand({
        UserPoolId: USER_POOL_ID,
        Username: u.Username,
      }));
      base.groups = (grpRes.Groups ?? []).map(g => g.GroupName);
      return base;
    }));
    return response(200, { users });
  } catch (err) {
    console.error(err);
    return response(500, { message: 'Internal Server Error', detail: err.message });
  }
};
