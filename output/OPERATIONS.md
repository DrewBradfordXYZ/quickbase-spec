# QuickBase API Operations

Auto-generated summary of 66 API operations.

**Spec Version:** 1.0.0

## Operations by Category

### Apps (7)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `copyApp` | POST | `/apps/{appId}/copy` | Copy an app |
| `createApp` | POST | `/apps` | Create an app |
| `deleteApp` | DELETE | `/apps/{appId}` | Delete an app |
| `getApp` | GET | `/apps/{appId}` | Get an app |
| `getAppEvents` | GET | `/apps/{appId}/events` | Get app events |
| `getRoles` | GET | `/apps/{appId}/roles` | Get app roles |
| `updateApp` | POST | `/apps/{appId}` | Update an app |

### Audit (1)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `audit` | POST | `/audit` | Get audit logs |

### Auth (2)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `exchangeSsoToken` | POST | `/auth/oauth/token` | Exchange an SSO token |
| `getTempTokenDBID` | GET | `/auth/temporary/{dbid}` | Get a temporary token for a dbid |

### Document Templates (1)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `generateDocument` | GET | `/docTemplates/{templateId}/generate` | Generate a document |

### Fields (7)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `createField` | POST | `/fields` | Create a field |
| `deleteFields` | DELETE | `/fields` | Delete field(s) |
| `getField` | GET | `/fields/{fieldId}` | Get field |
| `getFields` | GET | `/fields` | Get fields for a table |
| `getFieldsUsage` | GET | `/fields/usage` | Get usage for all fields |
| `getFieldUsage` | GET | `/fields/usage/{fieldId}` | Get usage for a field |
| `updateField` | POST | `/fields/{fieldId}` | Update a field |

### Files (2)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `deleteFile` | DELETE | `/files/{tableId}/{recordId}/{fieldId}/{versionNumber}` | Delete file |
| `downloadFile` | GET | `/files/{tableId}/{recordId}/{fieldId}/{versionNumber}` | Download file |

### Formulas (1)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `runFormula` | POST | `/formula/run` | Run a formula |

### Groups (6)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `addManagersToGroup` | POST | `/groups/{gid}/managers` | Add managers |
| `addMembersToGroup` | POST | `/groups/{gid}/members` | Add members |
| `addSubgroupsToGroup` | POST | `/groups/{gid}/subgroups` | Add child groups |
| `removeManagersFromGroup` | DELETE | `/groups/{gid}/managers` | Remove managers |
| `removeMembersFromGroup` | DELETE | `/groups/{gid}/members` | Remove members |
| `removeSubgroupsFromGroup` | DELETE | `/groups/{gid}/subgroups` | Remove child groups |

### Platform Analytics (2)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `platformAnalyticEventSummaries` | POST | `/analytics/events/summaries` | Get event summaries |
| `platformAnalyticReads` | GET | `/analytics/reads` | Get read summaries |

### Records (4)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `deleteRecords` | DELETE | `/records` | Delete record(s) |
| `recordsModifiedSince` | POST | `/records/modifiedSince` | Get records modified since |
| `runQuery` | POST | `/records/query` | Query for data |
| `upsert` | POST | `/records` | Insert/Update record(s) |

### Reports (3)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `getReport` | GET | `/reports/{reportId}` | Get a report |
| `getTableReports` | GET | `/reports` | Get reports for a table |
| `runReport` | POST | `/reports/{reportId}/run` | Run a report |

### Solutions (9)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `changesetSolution` | PUT | `/solutions/{solutionId}/changeset` | List solution changes |
| `changesetSolutionFromRecord` | GET | `/solutions/{solutionId}/changeset/fromrecord` | List solution changes from record |
| `createSolution` | POST | `/solutions` | Create a solution |
| `createSolutionFromRecord` | GET | `/solutions/fromrecord` | Create solution from record |
| `exportSolution` | GET | `/solutions/{solutionId}` | Export a solution |
| `exportSolutionToRecord` | GET | `/solutions/{solutionId}/torecord` | Export solution to record |
| `getSolutionPublic` | GET | `/solutions/{solutionId}/resources` | Get solution information |
| `updateSolution` | PUT | `/solutions/{solutionId}` | Update a solution |
| `updateSolutionToRecord` | GET | `/solutions/{solutionId}/fromrecord` | Update solution from record |

### Tables (9)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `createRelationship` | POST | `/tables/{tableId}/relationship` | Create a relationship |
| `createTable` | POST | `/tables` | Create a table |
| `deleteRelationship` | DELETE | `/tables/{tableId}/relationship/{relationshipId}` | Delete a relationship |
| `deleteTable` | DELETE | `/tables/{tableId}` | Delete a table |
| `getAppTables` | GET | `/tables` | Get tables for an app |
| `getRelationships` | GET | `/tables/{tableId}/relationships` | Get all relationships |
| `getTable` | GET | `/tables/{tableId}` | Get a table |
| `updateRelationship` | POST | `/tables/{tableId}/relationship/{relationshipId}` | Update a relationship |
| `updateTable` | POST | `/tables/{tableId}` | Update a table |

### Trustees (4)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `addTrustees` | POST | `/app/{appId}/trustees` | Add trustees to an app |
| `getTrustees` | GET | `/app/{appId}/trustees` | Get trustees for an app |
| `removeTrustees` | DELETE | `/app/{appId}/trustees` | Remove trustees from an app |
| `updateTrustees` | PATCH | `/app/{appId}/trustees` | Update trustees of an app |

### UserToken (4)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `cloneUserToken` | POST | `/usertoken/clone` | Clone a user token |
| `deactivateUserToken` | POST | `/usertoken/deactivate` | Deactivate a user token |
| `deleteUserToken` | DELETE | `/usertoken` | Delete a user token |
| `transferUserToken` | POST | `/usertoken/transfer` | Transfer a user token |

### Users (4)

| Operation | Method | Path | Summary |
|-----------|--------|------|---------|
| `denyUsers` | PUT | `/users/deny` | Deny users |
| `denyUsersAndGroups` | PUT | `/users/deny/{shouldDeleteFromGroups}` | Deny and remove users from groups |
| `getUsers` | POST | `/users` | Get users |
| `undenyUsers` | PUT | `/users/undeny` | Undeny users |

---

## Operation Details

### addManagersToGroup

**POST** `/groups/{gid}/managers`

Add managers

**Path Parameters:** `gid`

**Response:** 200 → `object`

---

### addMembersToGroup

**POST** `/groups/{gid}/members`

Add members

**Path Parameters:** `gid`

**Response:** 200 → `object`

---

### addSubgroupsToGroup

**POST** `/groups/{gid}/subgroups`

Add child groups

**Path Parameters:** `gid`

**Response:** 200 → `object`

---

### addTrustees

**POST** `/app/{appId}/trustees`

Add trustees to an app

**Path Parameters:** `appId`

**Response:** 200 → `object`

---

### audit

**POST** `/audit`

Get audit logs

**Request Body:** (required)

Optional fields:
- `nextToken` (string)
- `numRows` (integer)
- `queryId` (string)
- `date` (string)
- `topics` ([]string)

**Response:** 200 → `object`

---

### changesetSolution

**PUT** `/solutions/{solutionId}/changeset`

List solution changes

**Path Parameters:** `solutionId`

**Response:** 200 → `object`

---

### changesetSolutionFromRecord

**GET** `/solutions/{solutionId}/changeset/fromrecord`

List solution changes from record

**Path Parameters:** `solutionId`

**Query Parameters:** `tableId`, `fieldId`, `recordId`

**Response:** 200 → `object`

---

### cloneUserToken

**POST** `/usertoken/clone`

Clone a user token

**Request Body:** (required)

Optional fields:
- `name` (string)
- `description` (string)

**Response:** 200 → `object`

---

### copyApp

**POST** `/apps/{appId}/copy`

Copy an app

**Path Parameters:** `appId`

**Request Body:** (required)

Required fields:
- `name` (string)

Optional fields:
- `description` (string)
- `properties` (object)

**Response:** 200 → `object`

---

### createApp

**POST** `/apps`

Create an app

**Request Body:** (required)

Required fields:
- `name` (string)

Optional fields:
- `assignToken` (boolean)
- `variables` ([]object)
- `securityProperties` (object)
- `description` (string)

**Response:** 200 → `object`

---

### createField

**POST** `/fields`

Create a field

**Query Parameters:** `tableId`

**Request Body:** (required)

Required fields:
- `fieldType` (string)
- `label` (string)

Optional fields:
- `audited` (boolean)
- `fieldHelp` (string)
- `bold` (boolean)
- `properties` (object)
- `appearsByDefault` (boolean)
- `permissions` ([]object)
- `addToForms` (boolean)
- `findEnabled` (boolean)
- `noWrap` (boolean)

**Response:** 200 → `object`

---

### createRelationship

**POST** `/tables/{tableId}/relationship`

Create a relationship

**Path Parameters:** `tableId`

**Request Body:** (required)

Required fields:
- `parentTableId` (string)

Optional fields:
- `summaryFields` ([]object)
- `lookupFieldIds` ([]integer)
- `foreignKeyField` (object)

**Response:** 200 → `object`

---

### createSolution

**POST** `/solutions`

Create a solution

**Response:** 200 → `object`

---

### createSolutionFromRecord

**GET** `/solutions/fromrecord`

Create solution from record

**Query Parameters:** `tableId`, `fieldId`, `recordId`

**Response:** 200 → `object`

---

### createTable

**POST** `/tables`

Create a table

**Query Parameters:** `appId`

**Request Body:** (required)

Required fields:
- `name` (string)

Optional fields:
- `pluralRecordName` (string)
- `singleRecordName` (string)
- `description` (string)

**Response:** 200 → `object`

---

### deactivateUserToken

**POST** `/usertoken/deactivate`

Deactivate a user token

**Response:** 200 → `object`

---

### deleteApp

**DELETE** `/apps/{appId}`

Delete an app

**Path Parameters:** `appId`

**Request Body:** (required)

Required fields:
- `name` (string)

**Response:** 200 → `object`

---

### deleteFields

**DELETE** `/fields`

Delete field(s)

**Query Parameters:** `tableId`

**Request Body:** (required)

Required fields:
- `fieldIds` ([]integer)

**Response:** 200 → `object`

---

### deleteFile

**DELETE** `/files/{tableId}/{recordId}/{fieldId}/{versionNumber}`

Delete file

**Path Parameters:** `tableId`, `recordId`, `fieldId`, `versionNumber`

**Response:** 200 → `object`

---

### deleteRecords

**DELETE** `/records`

Delete record(s)

**Request Body:** (required)

Required fields:
- `from` (string)
- `where` (object)

**Response:** 200 → `object`

---

### deleteRelationship

**DELETE** `/tables/{tableId}/relationship/{relationshipId}`

Delete a relationship

**Path Parameters:** `tableId`, `relationshipId`

**Response:** 200 → `object`

---

### deleteTable

**DELETE** `/tables/{tableId}`

Delete a table

**Path Parameters:** `tableId`

**Query Parameters:** `appId`

**Response:** 200 → `object`

---

### deleteUserToken

**DELETE** `/usertoken`

Delete a user token

**Response:** 200 → `object`

---

### denyUsers

**PUT** `/users/deny`

Deny users

**Query Parameters:** `accountId`

**Response:** 200 → `object`

---

### denyUsersAndGroups

**PUT** `/users/deny/{shouldDeleteFromGroups}`

Deny and remove users from groups

**Path Parameters:** `shouldDeleteFromGroups`

**Query Parameters:** `accountId`

**Response:** 200 → `object`

---

### downloadFile

**GET** `/files/{tableId}/{recordId}/{fieldId}/{versionNumber}`

Download file

**Path Parameters:** `tableId`, `recordId`, `fieldId`, `versionNumber`

**Response:** 200 → `object`

---

### exchangeSsoToken

**POST** `/auth/oauth/token`

Exchange an SSO token

**Request Body:** (required)

Required fields:
- `grant_type` (string)
- `requested_token_type` (string)
- `subject_token` (string)
- `subject_token_type` (string)

**Response:** 200 → `object`

---

### exportSolution

**GET** `/solutions/{solutionId}`

Export a solution

**Path Parameters:** `solutionId`

**Response:** 200 → `object`

---

### exportSolutionToRecord

**GET** `/solutions/{solutionId}/torecord`

Export solution to record

**Path Parameters:** `solutionId`

**Query Parameters:** `tableId`, `fieldId`

**Response:** 200 → `object`

---

### generateDocument

**GET** `/docTemplates/{templateId}/generate`

Generate a document

**Path Parameters:** `templateId`

**Query Parameters:** `tableId`, `recordId`, `filename`, `format`, `margin`, `unit`, `pageSize`, `orientation`, `realm`

**Response:** 200 → `object`

---

### getApp

**GET** `/apps/{appId}`

Get an app

**Path Parameters:** `appId`

**Response:** 200 → `object`

---

### getAppEvents

**GET** `/apps/{appId}/events`

Get app events

**Path Parameters:** `appId`

**Response:** 200 → `[]object`

---

### getAppTables

**GET** `/tables`

Get tables for an app

**Query Parameters:** `appId`

**Response:** 200 → `[]object`

---

### getField

**GET** `/fields/{fieldId}`

Get field

**Path Parameters:** `fieldId`

**Query Parameters:** `tableId`, `includeFieldPerms`

**Response:** 200 → `object`

---

### getFields

**GET** `/fields`

Get fields for a table

**Query Parameters:** `tableId`, `includeFieldPerms`

**Response:** 200 → `[]object`

---

### getFieldsUsage

**GET** `/fields/usage`

Get usage for all fields

**Query Parameters:** `tableId`, `skip`, `top`

**Response:** 200 → `[]object`

---

### getFieldUsage

**GET** `/fields/usage/{fieldId}`

Get usage for a field

**Path Parameters:** `fieldId`

**Query Parameters:** `tableId`

**Response:** 200 → `[]object`

---

### getRelationships

**GET** `/tables/{tableId}/relationships`

Get all relationships

**Path Parameters:** `tableId`

**Query Parameters:** `skip`

**Response:** 200 → `object`

---

### getReport

**GET** `/reports/{reportId}`

Get a report

**Path Parameters:** `reportId`

**Query Parameters:** `tableId`

**Response:** 200 → `object`

---

### getRoles

**GET** `/apps/{appId}/roles`

Get app roles

**Path Parameters:** `appId`

**Response:** 200 → `[]object`

---

### getSolutionPublic

**GET** `/solutions/{solutionId}/resources`

Get solution information

**Path Parameters:** `solutionId`

**Response:** 200 → `object`

---

### getTable

**GET** `/tables/{tableId}`

Get a table

**Path Parameters:** `tableId`

**Query Parameters:** `appId`

**Response:** 200 → `object`

---

### getTableReports

**GET** `/reports`

Get reports for a table

**Query Parameters:** `tableId`

**Response:** 200 → `[]object`

---

### getTempTokenDBID

**GET** `/auth/temporary/{dbid}`

Get a temporary token for a dbid

**Path Parameters:** `dbid`

**Response:** 200 → `object`

---

### getTrustees

**GET** `/app/{appId}/trustees`

Get trustees for an app

**Path Parameters:** `appId`

**Response:** 200 → `[]object`

---

### getUsers

**POST** `/users`

Get users

**Query Parameters:** `accountId`

**Request Body:** (optional)

Optional fields:
- `emails` ([]string)
- `appIds` ([]string)
- `nextPageToken` (string)

**Response:** 200 → `object`

---

### platformAnalyticEventSummaries

**POST** `/analytics/events/summaries`

Get event summaries

**Query Parameters:** `accountId`

**Request Body:** (required)

Required fields:
- `start` (string)
- `end` (string)
- `groupBy` (string)

Optional fields:
- `nextToken` (string)
- `where` ([]object)

**Response:** 200 → `object`

---

### platformAnalyticReads

**GET** `/analytics/reads`

Get read summaries

**Query Parameters:** `day`

**Response:** 200 → `object`

---

### recordsModifiedSince

**POST** `/records/modifiedSince`

Get records modified since

**Request Body:** (optional)

Required fields:
- `after` (string)
- `from` (string)

Optional fields:
- `fieldList` ([]integer)
- `includeDetails` (boolean)

**Response:** 200 → `object`

---

### removeManagersFromGroup

**DELETE** `/groups/{gid}/managers`

Remove managers

**Path Parameters:** `gid`

**Response:** 200 → `object`

---

### removeMembersFromGroup

**DELETE** `/groups/{gid}/members`

Remove members

**Path Parameters:** `gid`

**Response:** 200 → `object`

---

### removeSubgroupsFromGroup

**DELETE** `/groups/{gid}/subgroups`

Remove child groups

**Path Parameters:** `gid`

**Response:** 200 → `object`

---

### removeTrustees

**DELETE** `/app/{appId}/trustees`

Remove trustees from an app

**Path Parameters:** `appId`

**Response:** 200 → `object`

---

### runFormula

**POST** `/formula/run`

Run a formula

**Request Body:** (required)

Required fields:
- `formula` (string)
- `from` (string)

Optional fields:
- `rid` (integer)

**Response:** 200 → `object`

---

### runQuery

**POST** `/records/query`

Query for data

**Request Body:** (required)

Required fields:
- `from` (string)

Optional fields:
- `options` (object)
- `where` (object)
- `groupBy` ([]object)
- `sortBy` (SortByUnion)
- `select` ([]integer)

**Response:** 200 → `object`

---

### runReport

**POST** `/reports/{reportId}/run`

Run a report

**Path Parameters:** `reportId`

**Query Parameters:** `tableId`, `skip`, `top`

**Response:** 200 → `object`

---

### transferUserToken

**POST** `/usertoken/transfer`

Transfer a user token

**Request Body:** (required)

Optional fields:
- `id` (number)
- `from` (string)
- `to` (string)

**Response:** 200 → `object`

---

### undenyUsers

**PUT** `/users/undeny`

Undeny users

**Query Parameters:** `accountId`

**Response:** 200 → `object`

---

### updateApp

**POST** `/apps/{appId}`

Update an app

**Path Parameters:** `appId`

**Request Body:** (optional)

Optional fields:
- `variables` ([]object)
- `name` (string)
- `securityProperties` (object)
- `description` (string)

**Response:** 200 → `object`

---

### updateField

**POST** `/fields/{fieldId}`

Update a field

**Path Parameters:** `fieldId`

**Query Parameters:** `tableId`

**Request Body:** (optional)

Optional fields: 12 additional fields

**Response:** 200 → `object`

---

### updateRelationship

**POST** `/tables/{tableId}/relationship/{relationshipId}`

Update a relationship

**Path Parameters:** `tableId`, `relationshipId`

**Request Body:** (optional)

Optional fields:
- `summaryFields` ([]object)
- `lookupFieldIds` ([]integer)

**Response:** 200 → `object`

---

### updateSolution

**PUT** `/solutions/{solutionId}`

Update a solution

**Path Parameters:** `solutionId`

**Response:** 200 → `object`

---

### updateSolutionToRecord

**GET** `/solutions/{solutionId}/fromrecord`

Update solution from record

**Path Parameters:** `solutionId`

**Query Parameters:** `tableId`, `fieldId`, `recordId`

**Response:** 200 → `object`

---

### updateTable

**POST** `/tables/{tableId}`

Update a table

**Path Parameters:** `tableId`

**Query Parameters:** `appId`

**Request Body:** (optional)

Optional fields:
- `name` (string)
- `pluralRecordName` (string)
- `singleRecordName` (string)
- `description` (string)

**Response:** 200 → `object`

---

### updateTrustees

**PATCH** `/app/{appId}/trustees`

Update trustees of an app

**Path Parameters:** `appId`

**Response:** 200 → `object`

---

### upsert

**POST** `/records`

Insert/Update record(s)

**Request Body:** (required)

Required fields:
- `to` (string)

Optional fields:
- `data` ([]QuickbaseRecord)
- `mergeFieldId` (integer)
- `fieldsToReturn` ([]integer)

**Response:** 200 → `object`

---
