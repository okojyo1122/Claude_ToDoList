'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);
const TASKS_TABLE = process.env.TASKS_TABLE;

const VALID_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

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
  return {
    userId: claims.sub,
    email: claims.email,
    groups: (claims['cognito:groups'] ?? '').split(',').filter(Boolean),
  };
}

async function getTasks(event) {
  const user = getUserInfo(event);
  const { teamId, assigneeId, status } = event.queryStringParameters ?? {};

  // 自分のタスクのみ表示するか、チーム全体か
  if (assigneeId) {
    const result = await ddb.send(new QueryCommand({
      TableName: TASKS_TABLE,
      IndexName: 'assignee-index',
      KeyConditionExpression: 'assigneeId = :assigneeId',
      ExpressionAttributeValues: { ':assigneeId': assigneeId },
    }));
    return response(200, { tasks: result.Items ?? [] });
  }

  if (teamId) {
    const params = {
      TableName: TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': teamId },
    };
    if (status) {
      params.FilterExpression = '#s = :status';
      params.ExpressionAttributeNames = { '#s': 'status' };
      params.ExpressionAttributeValues[':status'] = status;
    }
    const result = await ddb.send(new QueryCommand(params));
    return response(200, { tasks: result.Items ?? [] });
  }

  // チームが指定されない場合は自分の所属チームのタスクを全取得
  const userTeams = user.groups.filter(g => g !== 'admin');
  if (userTeams.length === 0) {
    return response(200, { tasks: [] });
  }

  const allTasks = [];
  for (const team of userTeams) {
    const result = await ddb.send(new QueryCommand({
      TableName: TASKS_TABLE,
      KeyConditionExpression: 'teamId = :teamId',
      ExpressionAttributeValues: { ':teamId': team },
    }));
    allTasks.push(...(result.Items ?? []));
  }
  return response(200, { tasks: allTasks });
}

async function createTask(event) {
  const user = getUserInfo(event);
  const body = JSON.parse(event.body ?? '{}');

  const { title, description, teamId, assigneeId, assigneeName, priority, dueDate, tags } = body;

  if (!title || !teamId) {
    return response(400, { message: 'title と teamId は必須です' });
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return response(400, { message: `priority は ${VALID_PRIORITIES.join(', ')} のいずれかです` });
  }

  const now = new Date().toISOString();
  const task = {
    teamId,
    taskId: `task-${uuidv4()}`,
    title,
    description: description ?? '',
    status: 'todo',
    priority: priority ?? 'medium',
    assigneeId: assigneeId ?? null,
    assigneeName: assigneeName ?? null,
    createdBy: user.userId,
    createdByEmail: user.email,
    dueDate: dueDate ?? null,
    tags: tags ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await ddb.send(new PutCommand({ TableName: TASKS_TABLE, Item: task }));
  return response(201, { task });
}

async function getTask(event) {
  const { taskId } = event.pathParameters ?? {};
  const { teamId } = event.queryStringParameters ?? {};

  if (!teamId) {
    return response(400, { message: 'teamId は必須です (クエリパラメータ)' });
  }

  const result = await ddb.send(new GetCommand({
    TableName: TASKS_TABLE,
    Key: { teamId, taskId },
  }));

  if (!result.Item) {
    return response(404, { message: 'タスクが見つかりません' });
  }
  return response(200, { task: result.Item });
}

async function updateTask(event) {
  const user = getUserInfo(event);
  const { taskId } = event.pathParameters ?? {};
  const body = JSON.parse(event.body ?? '{}');
  const { teamId, title, description, status, priority, assigneeId, assigneeName, dueDate, tags } = body;

  if (!teamId) {
    return response(400, { message: 'teamId は必須です' });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return response(400, { message: `status は ${VALID_STATUSES.join(', ')} のいずれかです` });
  }
  if (priority && !VALID_PRIORITIES.includes(priority)) {
    return response(400, { message: `priority は ${VALID_PRIORITIES.join(', ')} のいずれかです` });
  }

  const now = new Date().toISOString();
  const updateExpressions = ['#updatedAt = :updatedAt'];
  const expressionNames = { '#updatedAt': 'updatedAt' };
  const expressionValues = { ':updatedAt': now };

  if (title !== undefined) { updateExpressions.push('#title = :title'); expressionNames['#title'] = 'title'; expressionValues[':title'] = title; }
  if (description !== undefined) { updateExpressions.push('#description = :description'); expressionNames['#description'] = 'description'; expressionValues[':description'] = description; }
  if (status !== undefined) { updateExpressions.push('#status = :status'); expressionNames['#status'] = 'status'; expressionValues[':status'] = status; }
  if (priority !== undefined) { updateExpressions.push('#priority = :priority'); expressionNames['#priority'] = 'priority'; expressionValues[':priority'] = priority; }
  if (assigneeId !== undefined) { updateExpressions.push('#assigneeId = :assigneeId'); expressionNames['#assigneeId'] = 'assigneeId'; expressionValues[':assigneeId'] = assigneeId; }
  if (assigneeName !== undefined) { updateExpressions.push('#assigneeName = :assigneeName'); expressionNames['#assigneeName'] = 'assigneeName'; expressionValues[':assigneeName'] = assigneeName; }
  if (dueDate !== undefined) { updateExpressions.push('#dueDate = :dueDate'); expressionNames['#dueDate'] = 'dueDate'; expressionValues[':dueDate'] = dueDate; }
  if (tags !== undefined) { updateExpressions.push('#tags = :tags'); expressionNames['#tags'] = 'tags'; expressionValues[':tags'] = tags; }

  const result = await ddb.send(new UpdateCommand({
    TableName: TASKS_TABLE,
    Key: { teamId, taskId },
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionNames,
    ExpressionAttributeValues: expressionValues,
    ReturnValues: 'ALL_NEW',
  }));

  return response(200, { task: result.Attributes });
}

async function deleteTask(event) {
  const { taskId } = event.pathParameters ?? {};
  const { teamId } = event.queryStringParameters ?? {};

  if (!teamId) {
    return response(400, { message: 'teamId は必須です (クエリパラメータ)' });
  }

  await ddb.send(new DeleteCommand({
    TableName: TASKS_TABLE,
    Key: { teamId, taskId },
  }));
  return response(200, { message: 'タスクを削除しました' });
}

exports.handler = async (event) => {
  try {
    const method = event.httpMethod;
    const hasTaskId = event.pathParameters?.taskId;

    if (method === 'GET' && !hasTaskId) return await getTasks(event);
    if (method === 'POST' && !hasTaskId) return await createTask(event);
    if (method === 'GET' && hasTaskId) return await getTask(event);
    if (method === 'PUT' && hasTaskId) return await updateTask(event);
    if (method === 'DELETE' && hasTaskId) return await deleteTask(event);

    return response(405, { message: 'Method Not Allowed' });
  } catch (err) {
    console.error(err);
    return response(500, { message: 'Internal Server Error', detail: err.message });
  }
};
