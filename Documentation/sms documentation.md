Create Api

Dashboard

Create Api

&nbsp; 

API KEY : $2y$10$S.................fhhANf6lckKC236  



\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*

GET METHOD

\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*

Mask URL : 

http://sms.greenheritageit.com/smsapi?apiKey=$2y$10$SNO/yJjzH7CdEF..............KC236\&maskName={Mask Name}\&transactionType={TransactionType}\&campaignId={campaignId}\&mobileNo={Number}\&message={Message}



Non Mask URL : 

http://sms.greenheritageit.com/smsapi?apiKey=$2y$10$SNO/yJjzH7...........f6lckKC236\&senderId={senderId}\&transactionType={TransactionType}\&campaignId={campaignId}\&mobileNo={Number}\&message={Message}



Parameters :

Parameter Name	            Meaning/Value	                      Description

apiKey	                    API Key	                              Your API Key ($2y$10$SN.....hhANf6lckKC236)

maskName/senderid	    Source SenderID or Mask Name	      For Making SMS it must be alphanumeric Non Masking authorized long number can be used.



mobileNo	            mobile number	                  Exp: 88017XXXXXXXX,88018XXXXXXXX,88019XXXXXXXX...

campaignId	            Campaign ID	                          Required for promotional campaign! To run the promotional campaign get your content approved from the service provider.



message	                    SMS body	                          N.B: Please use url encoding to send some special characters like \&, $, @ etc



transactionType	            T/P	                                  use T label for transactional sms



Successful Response :

{

&nbsp; "messageid":"58026daf44542",

&nbsp; "status":"success",

&nbsp; "message":"Request has been accepted successfully"

}



Faild Response :

{

&nbsp; "messageid":"",

&nbsp; "status":"failed",

&nbsp; "message":"Please check your input data"

}



Check Balance API (API URL)

http://sms.greenheritageit.com/smsapi/getBalance?apiKey=( API Key )

Successful Response :

{

&nbsp;   "success": true,

&nbsp;   "wallet\_balance": "BDT 99999.99",

&nbsp;   "available\_bundle": {

&nbsp;       "masking": 0,

&nbsp;       "non\_masking": 99999

&nbsp;   },

&nbsp;   "expire\_date": null

}



Check Balance API(Invalid API Key Response) :

{

&nbsp;  "success": false, 

&nbsp;  "message": "API Key does not matched"

}



Get API Key

API URL

http://sms.greenheritageit.com/smsapi/getkey/login\_username/login\_password

Username

Your account User ID used to login

Password

Account password that you use to login

Successful Response :

{

&nbsp; "success": true,

&nbsp; "apiKey": "(API Key)"

}

&nbsp;                                   

Invalid API Key Response :

{

&nbsp;  "success": false, 

&nbsp;  "message": "API Key does not matched"

}







\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*

POST METHOD

\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*\*





Post URL : 

http://sms.greenheritageit.com/smsapi



Parameters :

Parameter Name	           Meaning/Value	      Description

api\_key	                   API Key	              Your API Key ($2y...C236)

transaction\_type	   T/P	                      use T label for transactional sms

campaign\_id	           Campaign ID	              Required for promotional campaign! To run the promotional campaign get your content approved from the service provider.



sms\_data	           SMS Parameters	      (Parameter, Description) = {(recipient,	mobile number), (sender\_id, Mask Name/Long number), (message, SMS Text)}



Json Format :

{

&nbsp; "api\_key":"xxxxxxxxxxxxxxxxxxxxx",

&nbsp; "transaction\_type":"P",

&nbsp; "campaign\_id":"cmp-DlVuuS8nxA",

&nbsp; "sms\_data":\[

&nbsp;   {

&nbsp;     "recipient":"01711xxxxxx",

&nbsp;     "sender\_id":"Sender ID",

&nbsp;     "message":"Test Message 1"

&nbsp;   },

&nbsp;   {

&nbsp;     "recipient":"01911xxxxxx",

&nbsp;     "sender\_id":"",

&nbsp;     "message":"Test Message 2"

&nbsp;   },

&nbsp;   {

&nbsp;     "recipient":"01811xxxxxx",

&nbsp;     "sender\_id":"Mask Name",

&nbsp;     "message":"Test Message 3"

&nbsp;   }

&nbsp; ]

}



Successful Response :

{

&nbsp; "messageid":"58026daf44542",

&nbsp; "status":"success",

&nbsp; "message":"Request has been accepted successfully"

}



Faild Response :

{

&nbsp; "messageid":"",

&nbsp; "status":"failed",

&nbsp; "message":"Please check your input data"

}



Sample Code Snippet:

// JSON data to be sent

$postData = \[

&nbsp;   'api\_key' => '',

&nbsp;   'transaction\_type' => 'T/P',

&nbsp;   'sms\_data' => \[

&nbsp;       \[

&nbsp;           'recipient' => '880171XYYYYYY',

&nbsp;           'sender\_id' => 'Sender ID',

&nbsp;           'message' => 'প্রিয় Mr Y, apnake ovinonndon!',

&nbsp;       ],

&nbsp;       \[

&nbsp;           'recipient' => '880191XYYYYYY',

&nbsp;           'sender\_id' => 'Sender ID',

&nbsp;           'message' => 'প্রিয় Y Office, ',

&nbsp;       ],

&nbsp;   ],

];



// Convert data to JSON format

$jsonData = json\_encode($postData);



// Endpoint URL

$endpointUrl = '';



// cURL initialization

$ch = curl\_init($endpointUrl);



// Set cURL options



curl\_setopt($ch, CURLOPT\_RETURNTRANSFER, true);

curl\_setopt($ch, CURLOPT\_POST, true);

curl\_setopt($ch, CURLOPT\_POSTFIELDS, $jsonData);

curl\_setopt($ch, CURLOPT\_HTTPHEADER, \['Content-Type: application/json']);



// Execute cURL session and get the response

$response = curl\_exec($ch);



// Check for errors

if (curl\_errno($ch)) {

&nbsp;   echo 'Curl error: ' . curl\_error($ch);

}



// Close cURL session

curl\_close($ch);



// Display the response

echo $response;

&nbsp;                                       

Check Balance API (API URL)

http://sms.greenheritageit.com/smsapi/getBalance?apiKey=( API Key )

Successful Response :

{

&nbsp;   "success": true,

&nbsp;   "wallet\_balance": "BDT 99999.99",

&nbsp;   "available\_bundle": {

&nbsp;       "masking": 0,

&nbsp;       "non\_masking": 99999

&nbsp;   },

&nbsp;   "expire\_date": null

}



Check Balance API (Invalid API Key Response) :

{

&nbsp;  "success": false, 

&nbsp;  "message": "API Key does not matched"

}



Get API Key

API URL

http://sms.greenheritageit.com/smsapi/getkey/login\_username/login\_password

Username

Your account User ID used to login

Password

Account password that you use to login

Successful Response :

{

&nbsp; "success": true,

&nbsp; "apiKey": "(API Key)"

}

&nbsp;                                   

Invalid API Key Response :

{

&nbsp;  "success": false, 

&nbsp;  "message": "API Key does not matched"

}



