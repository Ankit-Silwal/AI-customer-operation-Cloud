Endpoint	Purpose	Successful status	Bearer token
POST  /register	Create a user	201	No
POST /login	Get { user, token }	200	No
POST /organizations	Create an organization	201	Yes
GET /organizations/:id	Read your organization	200	Yes
POST /conversation	Create a conversation	201	Yes
GET /conversation/:id	Read a conversation	200	Yes
POST /documents	Store document text	201	Yes