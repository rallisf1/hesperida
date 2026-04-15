/**
 * @swagger
 * components:
 *   schemas:
 *     ErrorEnvelope:
 *       type: object
 *       required:
 *         - ok
 *         - error
 *         - request_id
 *       properties:
 *         ok:
 *           type: boolean
 *           example: false
 *         request_id:
 *           type: string
 *           example: req_01HXYZABC123
 *         error:
 *           type: object
 *           required:
 *             - code
 *             - message
 *           properties:
 *             code:
 *               type: string
 *               example: unauthorized
 *             message:
 *               type: string
 *               example: Missing or invalid x-api-key header.
 *             details:
 *               type: object
 *               additionalProperties: true
 *     SuccessEnvelopeBase:
 *       type: object
 *       required:
 *         - ok
 *         - request_id
 *         - data
 *       properties:
 *         ok:
 *           type: boolean
 *           enum: [true]
 *         request_id:
 *           type: string
 *           example: req_01HXYZABC123
 *         data:
 *           type: object
 *           additionalProperties: true
 *     UserRole:
 *       type: string
 *       enum: [admin, editor, viewer]
 *     JobStatus:
 *       type: string
 *       enum: [pending, processing, completed, failed]
 *     JobQueueStatus:
 *       type: string
 *       enum: [pending, waiting, processing, completed, failed, canceled]
 *     VerificationMethod:
 *       type: string
 *       enum: [dns, file]
 *       nullable: true
 *     User:
 *       type: object
 *       required: [id, name, email, role, group, is_superuser]
 *       properties:
 *         id: { type: string }
 *         name: { type: string }
 *         email: { type: string }
 *         role:
 *           $ref: '#/components/schemas/UserRole'
 *         group: { type: string }
 *         is_superuser: { type: boolean }
 *         forgot_token: { type: string, nullable: true }
 *         created_at: { type: string, format: date-time, nullable: true }
 *     Website:
 *       type: object
 *       required: [id, owner, users, url, description]
 *       properties:
 *         id: { type: string }
 *         owner: { type: string }
 *         users:
 *           type: array
 *           items: { type: string }
 *         url: { type: string }
 *         description: { type: string }
 *         verification_code: { type: string, nullable: true }
 *         verified_at: { type: string, format: date-time, nullable: true }
 *         verification_method:
 *           $ref: '#/components/schemas/VerificationMethod'
 *         created_at: { type: string, format: date-time, nullable: true }
 *     Job:
 *       type: object
 *       required: [id, website, types, status]
 *       properties:
 *         id: { type: string }
 *         website: { type: string }
 *         types:
 *           type: array
 *           items: { type: string }
 *         status:
 *           $ref: '#/components/schemas/JobStatus'
 *         options:
 *           type: object
 *           additionalProperties: true
 *           nullable: true
 *         created_at: { type: string, format: date-time, nullable: true }
 *         probe: { type: string, nullable: true }
 *         seo: { type: string, nullable: true }
 *         ssl: { type: string, nullable: true }
 *         whois:
 *           type: array
 *           items: { type: string }
 *           nullable: true
 *         wcag:
 *           type: array
 *           items: { type: string }
 *           nullable: true
 *         domain: { type: string, nullable: true }
 *         security: { type: string, nullable: true }
 *         stress: { type: string, nullable: true }
 *     JobQueueTask:
 *       type: object
 *       required: [id, job, type, status, attempts, next_run_at]
 *       properties:
 *         id: { type: string }
 *         job: { type: string }
 *         type: { type: string }
 *         target: { type: string, nullable: true }
 *         options:
 *           type: object
 *           additionalProperties: true
 *           nullable: true
 *         attempts: { type: integer }
 *         next_run_at: { type: string, format: date-time }
 *         status:
 *           $ref: '#/components/schemas/JobQueueStatus'
 *         created_at: { type: string, format: date-time, nullable: true }
 *     NotificationTarget:
 *       type: object
 *       required: [id, target, enabled, created_at, updated_at]
 *       properties:
 *         id: { type: string }
 *         target: { type: string }
 *         label: { type: string, nullable: true }
 *         enabled: { type: boolean }
 *         created_at: { type: string, format: date-time }
 *         updated_at: { type: string, format: date-time }
 *     ProbeGeo:
 *       type: object
 *       required: [lat, lon, country_name, country_code]
 *       properties:
 *         lat: { type: number }
 *         lon: { type: number }
 *         country_name: { type: string }
 *         country_code: { type: string }
 *         city: { type: string, nullable: true }
 *         zip: { type: string, nullable: true }
 *     ProbeResult:
 *       type: object
 *       additionalProperties: true
 *       properties:
 *         id: { type: string, nullable: true }
 *         job: { type: string, nullable: true }
 *         response_time: { type: string }
 *         secure: { type: boolean }
 *         server: { type: string }
 *         title: { type: string }
 *         favicon: { type: string, nullable: true }
 *         ipv4:
 *           type: array
 *           items: { type: string }
 *         ipv6:
 *           type: array
 *           items: { type: string }
 *         geo:
 *           $ref: '#/components/schemas/ProbeGeo'
 *         cdn:
 *           type: object
 *           nullable: true
 *           properties:
 *             name: { type: string }
 *             type: { type: string }
 *         tech:
 *           type: array
 *           items: { type: string }
 *         wp_plugins:
 *           type: array
 *           items: { type: string }
 *         wp_themes:
 *           type: array
 *           items: { type: string }
 *     SSLResult:
 *       type: object
 *       additionalProperties: true
 *       properties:
 *         id: { type: string, nullable: true }
 *         job: { type: string, nullable: true }
 *         valid_from: { type: string, format: date-time }
 *         valid_to: { type: string, format: date-time }
 *         protocol: { type: string }
 *         expires_in: { type: integer, nullable: true }
 *         owner:
 *           type: object
 *           additionalProperties: true
 *         issuer:
 *           type: object
 *           additionalProperties: true
 *     DomainResult:
 *       type: object
 *       additionalProperties: true
 *       properties:
 *         id: { type: string, nullable: true }
 *         domain: { type: string, nullable: true }
 *         tld: { type: string, nullable: true }
 *         expirationDate: { type: string, format: date-time, nullable: true }
 *         expires_in: { type: integer, nullable: true }
 *         records:
 *           type: object
 *           additionalProperties: true
 *           nullable: true
 *     WhoisResult:
 *       type: object
 *       additionalProperties: true
 *       properties:
 *         id: { type: string, nullable: true }
 *         job: { type: string, nullable: true }
 *         as: { type: integer }
 *         country: { type: string }
 *         date: { type: string, format: date-time }
 *         ip: { type: string }
 *         name: { type: string }
 *         network: { type: string }
 *         registry: { type: string }
 *     ScoreResult:
 *       type: object
 *       additionalProperties: true
 *       required: [score, passes, warnings, errors, raw]
 *       properties:
 *         id: { type: string, nullable: true }
 *         job: { type: string, nullable: true }
 *         score: { type: number }
 *         passes: { type: integer }
 *         warnings: { type: integer }
 *         errors: { type: integer }
 *         raw:
 *           type: object
 *           additionalProperties: true
 *         created_at: { type: string, format: date-time, nullable: true }
 *     WcagResult:
 *       allOf:
 *         - $ref: '#/components/schemas/ScoreResult'
 *         - type: object
 *           required: [device]
 *           properties:
 *             device: { type: string }
 *             screenshot: { type: string, nullable: true }
 *     ResultsTool:
 *       type: string
 *       enum: [probe, seo, ssl, wcag, whois, domain, security, stress]
 *     AuthSessionData:
 *       type: object
 *       required: [user, token, refresh_token]
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *         token: { type: string }
 *         refresh_token: { type: string, nullable: true }
 *     AuthCurrentUserData:
 *       type: object
 *       required: [user]
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *     SuccessData:
 *       type: object
 *       required: [success]
 *       properties:
 *         success: { type: boolean, enum: [true] }
 *     DeleteData:
 *       type: object
 *       required: [deleted]
 *       properties:
 *         deleted: { type: boolean, enum: [true] }
 *     PaginationMeta:
 *       type: object
 *       required: [page, page_size, total_items]
 *       properties:
 *         page: { type: integer, minimum: 1 }
 *         page_size: { type: integer, minimum: 1 }
 *         total_items: { type: integer, minimum: 0 }
 *     UsersListData:
 *       type: object
 *       required: [users]
 *       properties:
 *         users:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *     UsersListPaginatedData:
 *       allOf:
 *         - $ref: '#/components/schemas/UsersListData'
 *         - $ref: '#/components/schemas/PaginationMeta'
 *     WebsitesListData:
 *       type: object
 *       required: [websites]
 *       properties:
 *         websites:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Website'
 *     WebsitesListPaginatedData:
 *       allOf:
 *         - $ref: '#/components/schemas/WebsitesListData'
 *         - $ref: '#/components/schemas/PaginationMeta'
 *     JobsListData:
 *       type: object
 *       required: [jobs]
 *       properties:
 *         jobs:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Job'
 *     JobsListPaginatedData:
 *       allOf:
 *         - $ref: '#/components/schemas/JobsListData'
 *         - $ref: '#/components/schemas/PaginationMeta'
 *     JobQueueListData:
 *       type: object
 *       required: [tasks]
 *       properties:
 *         tasks:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/JobQueueTask'
 *     JobQueueListPaginatedData:
 *       allOf:
 *         - $ref: '#/components/schemas/JobQueueListData'
 *         - $ref: '#/components/schemas/PaginationMeta'
 *     UserData:
 *       type: object
 *       required: [user]
 *       properties:
 *         user:
 *           $ref: '#/components/schemas/User'
 *     WebsiteData:
 *       type: object
 *       required: [website]
 *       properties:
 *         website:
 *           $ref: '#/components/schemas/Website'
 *     JobData:
 *       type: object
 *       required: [job]
 *       properties:
 *         job:
 *           $ref: '#/components/schemas/Job'
 *     JobQueueTaskData:
 *       type: object
 *       required: [task]
 *       properties:
 *         task:
 *           $ref: '#/components/schemas/JobQueueTask'
 *     JobQueueByJobData:
 *       type: object
 *       required: [tasks]
 *       properties:
 *         tasks:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/JobQueueTask'
 *     NotificationTargetsData:
 *       type: object
 *       required: [targets]
 *       properties:
 *         targets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NotificationTarget'
 *     NotificationTargetAndTargetsData:
 *       type: object
 *       required: [target, targets]
 *       properties:
 *         target:
 *           $ref: '#/components/schemas/NotificationTarget'
 *         targets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NotificationTarget'
 *     NotificationTargetsDeleteData:
 *       type: object
 *       required: [deleted, targets]
 *       properties:
 *         deleted: { type: boolean, enum: [true] }
 *         targets:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/NotificationTarget'
 *     WebsiteMembersData:
 *       type: object
 *       required: [owner_user, member_users]
 *       properties:
 *         owner_user:
 *           $ref: '#/components/schemas/User'
 *         member_users:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *     WebsiteInviteData:
 *       type: object
 *       required: [website, invited_user]
 *       properties:
 *         website:
 *           $ref: '#/components/schemas/Website'
 *         invited_user:
 *           $ref: '#/components/schemas/User'
 *     WebsiteUninviteData:
 *       type: object
 *       required: [website, removed]
 *       properties:
 *         website:
 *           $ref: '#/components/schemas/Website'
 *         removed: { type: boolean }
 *     WebsiteTransferOwnershipData:
 *       type: object
 *       required: [website, owner_user, previous_owner_kept_access]
 *       properties:
 *         website:
 *           $ref: '#/components/schemas/Website'
 *         owner_user:
 *           $ref: '#/components/schemas/User'
 *         previous_owner_kept_access: { type: boolean }
 *     WebsiteVerificationDetails:
 *       type: object
 *       required: [verified, method, txt_host, txt_value, http_url]
 *       properties:
 *         verified: { type: boolean }
 *         method:
 *           $ref: '#/components/schemas/VerificationMethod'
 *         txt_host: { type: string }
 *         txt_value: { type: string }
 *         http_url: { type: string }
 *         errors:
 *           nullable: true
 *           oneOf:
 *             - type: array
 *               items: { type: string }
 *             - type: object
 *               additionalProperties: true
 *     WebsiteVerificationData:
 *       type: object
 *       required: [website_id, verification]
 *       properties:
 *         website_id: { type: string }
 *         verification:
 *           $ref: '#/components/schemas/WebsiteVerificationDetails'
 *     ResultsByJobData:
 *       type: object
 *       required: [job]
 *       properties:
 *         job:
 *           type: object
 *           additionalProperties: true
 *     ResultByToolData:
 *       type: object
 *       required: [tool, result]
 *       properties:
 *         tool:
 *           $ref: '#/components/schemas/ResultsTool'
 *         result:
 *           oneOf:
 *             - $ref: '#/components/schemas/ProbeResult'
 *             - $ref: '#/components/schemas/SSLResult'
 *             - $ref: '#/components/schemas/DomainResult'
 *             - $ref: '#/components/schemas/WhoisResult'
 *             - $ref: '#/components/schemas/ScoreResult'
 *             - type: array
 *               items:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/WcagResult'
 *                   - $ref: '#/components/schemas/WhoisResult'
 *     AuthSessionEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/AuthSessionData'
 *     AuthCurrentUserEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/AuthCurrentUserData'
 *     SuccessEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/SuccessData'
 *     DeleteEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/DeleteData'
 *     UsersListEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               oneOf:
 *                 - $ref: '#/components/schemas/UsersListData'
 *                 - $ref: '#/components/schemas/UsersListPaginatedData'
 *     WebsitesListEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               oneOf:
 *                 - $ref: '#/components/schemas/WebsitesListData'
 *                 - $ref: '#/components/schemas/WebsitesListPaginatedData'
 *     JobsListEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               oneOf:
 *                 - $ref: '#/components/schemas/JobsListData'
 *                 - $ref: '#/components/schemas/JobsListPaginatedData'
 *     JobQueueListEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               oneOf:
 *                 - $ref: '#/components/schemas/JobQueueListData'
 *                 - $ref: '#/components/schemas/JobQueueListPaginatedData'
 *     UserEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/UserData'
 *     WebsiteEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/WebsiteData'
 *     JobEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/JobData'
 *     JobQueueTaskEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/JobQueueTaskData'
 *     JobQueueByJobEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/JobQueueByJobData'
 *     NotificationTargetsEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/NotificationTargetsData'
 *     NotificationTargetAndTargetsEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/NotificationTargetAndTargetsData'
 *     NotificationTargetsDeleteEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/NotificationTargetsDeleteData'
 *     WebsiteMembersEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/WebsiteMembersData'
 *     WebsiteInviteEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/WebsiteInviteData'
 *     WebsiteUninviteEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/WebsiteUninviteData'
 *     WebsiteTransferOwnershipEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/WebsiteTransferOwnershipData'
 *     WebsiteVerificationEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/WebsiteVerificationData'
 *     ResultsByJobEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/ResultsByJobData'
 *     ResultByToolEnvelope:
 *       allOf:
 *         - $ref: '#/components/schemas/SuccessEnvelopeBase'
 *         - type: object
 *           properties:
 *             data:
 *               $ref: '#/components/schemas/ResultByToolData'
 */
