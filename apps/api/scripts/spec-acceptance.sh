API=http://127.0.0.1:3099/api
MONGO="docker exec uf-test-mongo mongosh rentos_spec_e2e --quiet --eval"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1 (expected $2, got $3)"; FAIL=$((FAIL+1)); fi; }
code() { curl -s -o /tmp/body.json -w '%{http_code}' "$@"; }
jqp() { python3 -c "import json,sys;d=json.load(open('/tmp/body.json'));$1"; }

reg() { curl -s -X POST $API/auth/register -H 'content-type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"Str0ng!Pass1\",\"firstName\":\"T\",\"lastName\":\"User\",\"phone\":\"$2\",\"role\":\"landlord\"}" > /dev/null; }
login() { curl -s -X POST $API/auth/login -H 'content-type: application/json' \
  -d "{\"email\":\"$1\",\"password\":\"Str0ng!Pass1\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["data"]["token"])'; }
mkprop() { curl -s -X POST $API/properties -H "authorization: Bearer $1" -H 'content-type: application/json' \
  -d "{\"title\":\"$2\",\"description\":\"Spec run listing\",\"type\":\"apartment\",\"address\":{\"street\":\"1 Spec Rd\",\"city\":\"Accra\",\"region\":\"Greater Accra\"},\"rentAmount\":1200,\"rentDurationMonths\":12,\"advanceMonths\":6}" \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d["data"]["id"] if d.get("success") else "")'; }

SUF=$RANDOM
reg "owner$SUF@t.gh" "024400$SUF"; OWNER=$(login "owner$SUF@t.gh")
reg "other$SUF@t.gh" "024401$SUF"; OTHER=$(login "other$SUF@t.gh")
reg "su$SUF@t.gh" "024402$SUF"
$MONGO "db.users.updateOne({email:'su$SUF@t.gh'},{\$set:{roles:['super_admin'],activeRole:'super_admin'}})" > /dev/null
SU=$(login "su$SUF@t.gh")
OWNER_ID=$($MONGO "print(db.users.findOne({email:'owner$SUF@t.gh'})._id.toString())" | tr -d '\r')

echo "== §18 Super admin moderation =="
PROP=$(mkprop "$OWNER" "Owner Listing")
[ -n "$PROP" ] && check "property created" ok ok || check "property created" ok fail

check "owner submits" 200 "$(code -X POST $API/properties/$PROP/submit -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{}')"
code $API/properties/review-queue -H "authorization: Bearer $SU" > /dev/null
check "super admin sees own submission in queue" 1 "$(PID=$PROP python3 -c 'import json,os;d=json.load(open("/tmp/body.json"));print(len([i for i in d["data"]["items"] if i["id"]==os.environ["PID"]]))')"
check "super admin requests changes" 200 "$(code -X POST $API/properties/$PROP/review -H "authorization: Bearer $SU" -H 'content-type: application/json' -d '{"action":"request_changes","issues":["Add interior photos"],"note":"Needs photos"}')"
check "reject without a reason refused" 400 "$(code -X POST $API/properties/$PROP/review -H "authorization: Bearer $SU" -H 'content-type: application/json' -d '{"action":"reject"}')"
check "owner resubmits" 200 "$(code -X POST $API/properties/$PROP/submit -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{}')"
check "new review cycle" 2 "$(jqp 'print(d["data"]["reviewVersion"])')"
code $API/properties/$PROP/reviews -H "authorization: Bearer $SU" > /dev/null
check "prior review preserved" 3 "$(jqp 'print(d["data"]["total"])')"
check "super admin approves" 200 "$(code -X POST $API/properties/$PROP/review -H "authorization: Bearer $SU" -H 'content-type: application/json' -d '{"action":"approve"}')"
check "non-reviewer denied" 403 "$(code -X POST $API/properties/$PROP/review -H "authorization: Bearer $OTHER" -H 'content-type: application/json' -d '{"action":"approve"}')"
check "illegal transition refused" 409 "$(code -X POST $API/properties/$PROP/review -H "authorization: Bearer $SU" -H 'content-type: application/json' -d '{"action":"request_changes","issues":["x"]}')"

echo "== §18 Entitlements =="
check "storefront denied without plan" 402 "$(code -X POST $API/storefronts -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"slug":"homes-'$SUF'","name":"Homes"}')"
code $API/entitlements/me -H "authorization: Bearer $OWNER" > /dev/null
check "storefront withheld by default" False "$(jqp 'print(d["data"]["features"]["storefront.enabled"])')"

$MONGO "db.subscriptionpackages.insertOne({name:'Pro$SUF',slug:'pro-$SUF',price:100,billingCycle:'monthly',maxProperties:50,benefits:[],isActive:true,isDefault:false,sortOrder:1,version:1,platformFeePercent:5});
 var p=db.subscriptionpackages.findOne({slug:'pro-$SUF'});
 db.users.updateOne({email:'owner$SUF@t.gh'},{\$set:{subscriptionPackageId:p._id.toString()}});
 db.planentitlements.insertMany([
  {planId:p._id.toString(),planVersion:1,featureKey:'storefront.enabled',value:true,createdAt:new Date(),updatedAt:new Date()},
  {planId:p._id.toString(),planVersion:1,featureKey:'storefront.custom_domain',value:true,createdAt:new Date(),updatedAt:new Date()}])" > /dev/null

code $API/entitlements/me -H "authorization: Bearer $OWNER" > /dev/null
check "grant takes effect with no redeploy" True "$(jqp 'print(d["data"]["features"]["storefront.enabled"])')"
check "reserved slug refused" 400 "$(code -X POST $API/storefronts -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"slug":"admin","name":"Bad"}')"
check "storefront created once entitled" 201 "$(code -X POST $API/storefronts -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"slug":"homes-'$SUF'","name":"Homes by Ama"}')"

echo "== §18 Storefront A never returns B's listings =="
OPROP=$(mkprop "$OTHER" "Other Seller Listing")
code -X POST $API/properties/$OPROP/submit -H "authorization: Bearer $OTHER" -H 'content-type: application/json' -d '{}' > /dev/null
code -X POST $API/properties/$OPROP/review -H "authorization: Bearer $SU" -H 'content-type: application/json' -d '{"action":"approve"}' > /dev/null
code $API/storefronts/homes-$SUF/properties > /dev/null
check "storefront returns only its own listings" 0 "$(OID=$OWNER_ID python3 -c 'import json,os;d=json.load(open("/tmp/body.json"));print(len([i for i in d["data"]["items"] if i.get("landlordId")!=os.environ["OID"]]))')"
check "and it does contain the owner listing" 1 "$(PID=$PROP python3 -c 'import json,os;d=json.load(open("/tmp/body.json"));print(len([i for i in d["data"]["items"] if i["id"]==os.environ["PID"]]))')"

echo "== §18 Custom domain =="
check "domain added" 201 "$(code -X POST $API/storefronts/me/domains -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"domain":"homesbyama'$SUF'.com"}')"
DOM=$(jqp 'print(d["data"]["id"])')
check "unverified domain cannot be canonical" 409 "$(code -X POST $API/storefronts/me/domains/$DOM/canonical -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{}')"

echo "== §18 Coupons and affiliate =="
check "coupon denied without entitlement" 402 "$(code -X POST $API/marketplace/promotions -H "authorization: Bearer $OTHER" -H 'content-type: application/json' -d '{"code":"NOPLAN'$SUF'","type":"percentage","value":10,"startAt":"2026-01-01","endAt":"2027-01-01"}')"
check "affiliate denied without entitlement" 402 "$(code -X POST $API/marketplace/affiliate/profile -H "authorization: Bearer $OTHER" -H 'content-type: application/json' -d '{}')"

echo "== §18 Sponsorship cannot bypass moderation =="
DPROP=$(mkprop "$OWNER" "Unapproved Listing")
$MONGO "db.sponsorshipproducts.insertOne({name:'Top spot',placement:'search_top',durationDays:7,price:0,targeting:{},isActive:true,sortOrder:1,createdAt:new Date(),updatedAt:new Date()})" > /dev/null
SPROD=$($MONGO "print(db.sponsorshipproducts.findOne({name:'Top spot'})._id.toString())" | tr -d '\r')
check "cannot sponsor an unapproved listing" 409 "$(code -X POST $API/marketplace/sponsorship/campaigns -H "authorization: Bearer $OWNER" -H 'content-type: application/json' -d '{"propertyId":"'$DPROP'","productId":"'$SPROD'"}')"

echo "== §18 External review is optional =="
code $API/reviewer-organizations -H "authorization: Bearer $SU" > /dev/null
check "no authority configured by default" 0 "$(jqp 'print(d["data"]["total"])')"

echo "== §8.4 Webhook rejects a bad signature =="
check "unsigned webhook rejected" 401 "$(code -X POST $API/webhooks/marketplace/paystack -H 'content-type: application/json' -d '{"event":"charge.success","data":{"reference":"x"}}')"

echo
echo "RESULT: $PASS passed, $FAIL failed"
