'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const COMMENTS_TABLE = process.env.COMMENTS_TABLE;

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

function getUserInfo(event) {
  const claims = event.requestContext?.authorizer?.claims ?? {};
  return { userId: claims.sub, email: claims.email };
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const { taskId, commentId } = event.pathParameters ?? {};
    const user = getUserInfo(event);

    if (method === 'GET') {
      const result = await ddb.send(new QueryCommand({
        TableName: COMMENTS_TABLE,
        KeyConditionExpression: 'taskId = :taskId',
        ExpressionAttributeValues: { ':taskId': taskId },
      }));
      return response(200, { comments: result.Items ?? [] });
    }

    if (method === 'POST') {
      const body = JSON.parse(event.body ?? '{}');
      if (!body.content) return response(400, { message: 'content は必須です' });

      const now = new Date().toISOString();
      const comment = {
        taskId,
        commentId: `comment-${uuidv4()}`,
        content: body.content,
        authorId: user.userId,
        authorEmail: user.email,
        createdAt: now,
      };
      await ddb.send(new PutCommand({ TableName: COMMENTS_TABLE, Item: comment }));
      return response(201, { comment });
    }

    if (method === 'DELETE') {
      await ddb.send(new DeleteCommand({
        TableName: COMMENTS_TABLE,
        Key: { taskId, commentId },
      }));
      return response(200, { message: 'コメントを削除しました' });
    }

    return response(405, { message: 'Method Not Allowed' });
  } catch (err) {
    console.error(err);
    return response(500, { message: 'Internal Server Error', detail: err.message });
  }
};
