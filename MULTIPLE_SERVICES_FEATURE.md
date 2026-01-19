# Multiple Services Support - Payment System

## Overview
Enhanced the payment system to support users adding multiple services in a single order/checkout session. The system now accepts both single and multiple service plans while maintaining backward compatibility.

## Changes Made

### 1. Order Schema Updates
**File**: `/src/models/orderSchema.js`

Added new field to support multiple service plans:
```javascript
servicePlan: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'ServicePlan',
  required: false // Made optional for backward compatibility
},
servicePlans: [{
  type: mongoose.Schema.Types.ObjectId,
  ref: 'ServicePlan'
}]
```

**Key Points**:
- `servicePlan` - Single service (kept for backward compatibility)
- `servicePlans` - Array of service plans (new feature)
- Both fields can coexist in the same order

### 2. Payment Controller Updates
**File**: `/src/controllers/paymentController.js`

#### createCheckoutSession
Enhanced to accept both formats:

**Single Service (Backward Compatible)**:
```json
{
  "servicePlanId": "507f1f77bcf86cd799439011",
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

**Multiple Services (New Feature)**:
```json
{
  "servicePlanIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

**Features**:
- ✅ Accepts `servicePlanId` (single) OR `servicePlanIds` (array)
- ✅ Validates all service plans exist
- ✅ Calculates total amount from all services
- ✅ Creates single Razorpay order for all services
- ✅ Stores all service plan IDs in order
- ✅ Returns detailed breakdown of all services

#### verifyPayment
- ✅ Populates both `servicePlan` and `servicePlans`
- ✅ Works with both single and multiple services

#### getOrderStatus
- ✅ Populates both `servicePlan` and `servicePlans`
- ✅ Returns complete service information

#### getUserOrders
- ✅ Populates both `servicePlan` and `servicePlans`
- ✅ Lists all services in each order

## API Usage

### Create Checkout Session

#### Endpoint
```
POST /api/payment/create-checkout-session
```

#### Headers
```
Authorization: Bearer {user_token}
Content-Type: application/json
```

#### Request Body (Single Service)
```json
{
  "servicePlanId": "507f1f77bcf86cd799439011",
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

#### Request Body (Multiple Services)
```json
{
  "servicePlanIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

#### Response (Multiple Services)
```json
{
  "success": true,
  "message": "Checkout session created successfully",
  "data": {
    "orderId": "ORD_1704623400000_abc123xyz",
    "razorpayOrderId": "order_N1234567890",
    "amount": 1500,
    "currency": "INR",
    "keyId": "rzp_test_xxxxx",
    "servicePlans": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "AC Repair",
        "price": 500,
        "category": "Home Services"
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "name": "Plumbing",
        "price": 600,
        "category": "Home Services"
      },
      {
        "id": "507f1f77bcf86cd799439013",
        "name": "Electrical Work",
        "price": 400,
        "category": "Home Services"
      }
    ],
    "serviceCount": 3,
    "customerDetails": {
      "name": "John Doe",
      "email": "john@example.com",
      "phone": "+919876543210"
    },
    "receipt": "receipt_1704623400000",
    "location": {
      "type": "Point",
      "coordinates": [77.1025, 28.7041]
    }
  }
}
```

## Database Structure

### Order Document Example (Multiple Services)
```javascript
{
  "_id": ObjectId("..."),
  "orderId": "ORD_1704623400000_abc123xyz",
  "userId": ObjectId("..."),
  "servicePlan": ObjectId("507f1f77bcf86cd799439011"), // First service (backward compat)
  "servicePlans": [
    ObjectId("507f1f77bcf86cd799439011"),
    ObjectId("507f1f77bcf86cd799439012"),
    ObjectId("507f1f77bcf86cd799439013")
  ],
  "amount": 1500, // Total of all services
  "currency": "INR",
  "status": "created",
  "razorpayOrderId": "order_N1234567890",
  "customerDetails": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+919876543210"
  },
  "location": {
    "type": "Point",
    "coordinates": [77.1025, 28.7041]
  },
  "notes": {
    "orderId": "ORD_1704623400000_abc123xyz",
    "servicePlanIds": "507f1f77bcf86cd799439011,507f1f77bcf86cd799439012,507f1f77bcf86cd799439013",
    "servicePlanNames": "AC Repair, Plumbing, Electrical Work",
    "userId": "...",
    "serviceCount": "3"
  },
  "createdAt": ISODate("..."),
  "updatedAt": ISODate("...")
}
```

## Razorpay Integration

### Order Notes
When multiple services are selected, the Razorpay order includes:
```javascript
{
  "notes": {
    "orderId": "ORD_1704623400000_abc123xyz",
    "servicePlanIds": "507f1f77bcf86cd799439011,507f1f77bcf86cd799439012,507f1f77bcf86cd799439013",
    "servicePlanNames": "AC Repair, Plumbing, Electrical Work",
    "userId": "507f1f77bcf86cd799439014",
    "serviceCount": "3"
  }
}
```

### Amount Calculation
```javascript
// Example: 3 services
const servicePlans = [
  { name: "AC Repair", price: 500 },
  { name: "Plumbing", price: 600 },
  { name: "Electrical Work", price: 400 }
];

const totalAmount = servicePlans.reduce((sum, plan) => sum + plan.price, 0);
// totalAmount = 1500

// Razorpay expects amount in paise (smallest currency unit)
const razorpayAmount = totalAmount * 100; // 150000 paise = ₹1500
```

## Backward Compatibility

### Single Service Orders (Old Format)
```json
{
  "servicePlanId": "507f1f77bcf86cd799439011"
}
```

**Still works!** The system automatically:
1. Converts to array: `planIds = [servicePlanId]`
2. Stores in both fields:
   - `servicePlan`: First (and only) service
   - `servicePlans`: Array with one service
3. Returns response with `servicePlans` array

### Migration Strategy
- ✅ No database migration required
- ✅ Existing orders continue to work
- ✅ New orders can use either format
- ✅ Frontend can gradually adopt new format

## Validation

### Service Plan Validation
```javascript
// 1. At least one service required
if (!servicePlanId && (!servicePlanIds || servicePlanIds.length === 0)) {
  return error("At least one service plan ID is required");
}

// 2. All services must exist
if (servicePlans.length !== planIds.length) {
  return error("Some service plans were not found");
}

// 3. Services must be valid ObjectIds
// Mongoose handles this automatically
```

### Location Validation
```javascript
// Latitude: -90 to 90
// Longitude: -180 to 180
if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
  return error("Invalid coordinates");
}
```

## Use Cases

### Use Case 1: Single Service Booking
**Scenario**: User books AC repair only

**Request**:
```json
{
  "servicePlanId": "507f1f77bcf86cd799439011",
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

**Result**: 
- Single Razorpay order for ₹500
- Order contains 1 service

### Use Case 2: Multiple Services Booking
**Scenario**: User books AC repair + Plumbing + Electrical work

**Request**:
```json
{
  "servicePlanIds": [
    "507f1f77bcf86cd799439011",
    "507f1f77bcf86cd799439012",
    "507f1f77bcf86cd799439013"
  ],
  "latitude": 28.7041,
  "longitude": 77.1025
}
```

**Result**:
- Single Razorpay order for ₹1500 (500+600+400)
- Order contains 3 services
- User pays once for all services

### Use Case 3: Service Package
**Scenario**: Pre-defined package with multiple services

**Request**:
```json
{
  "servicePlanIds": [
    "home_cleaning_basic",
    "home_cleaning_deep",
    "pest_control"
  ]
}
```

**Result**:
- Bundled services in single order
- Single payment for entire package

## Frontend Integration

### React/React Native Example
```javascript
// Single service
const checkoutSingleService = async (servicePlanId) => {
  const response = await fetch('/api/payment/create-checkout-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      servicePlanId,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude
    })
  });
  
  const data = await response.json();
  // Proceed with Razorpay payment
};

// Multiple services
const checkoutMultipleServices = async (servicePlanIds) => {
  const response = await fetch('/api/payment/create-checkout-session', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      servicePlanIds, // Array of IDs
      latitude: userLocation.latitude,
      longitude: userLocation.longitude
    })
  });
  
  const data = await response.json();
  
  // Display service breakdown
  console.log(`Total: ₹${data.data.amount}`);
  console.log(`Services: ${data.data.serviceCount}`);
  data.data.servicePlans.forEach(service => {
    console.log(`- ${service.name}: ₹${service.price}`);
  });
  
  // Proceed with Razorpay payment
};
```

## Benefits

1. **Better User Experience**: Users can book multiple services at once
2. **Single Payment**: One transaction for all services
3. **Simplified Checkout**: No need for multiple payment sessions
4. **Cost Efficiency**: Reduced payment gateway fees (single transaction vs multiple)
5. **Better Analytics**: Track service bundles and combinations
6. **Backward Compatible**: Existing integrations continue to work

## Testing

### Test Cases

#### Test 1: Single Service
```bash
curl -X POST http://localhost:8080/api/payment/create-checkout-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "servicePlanId": "507f1f77bcf86cd799439011",
    "latitude": 28.7041,
    "longitude": 77.1025
  }'
```

#### Test 2: Multiple Services
```bash
curl -X POST http://localhost:8080/api/payment/create-checkout-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "servicePlanIds": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"],
    "latitude": 28.7041,
    "longitude": 77.1025
  }'
```

#### Test 3: Invalid Service
```bash
curl -X POST http://localhost:8080/api/payment/create-checkout-session \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "servicePlanIds": ["invalid_id"],
    "latitude": 28.7041,
    "longitude": 77.1025
  }'
```

Expected: 404 error "Some service plans were not found"

## Error Handling

### No Services Provided
```json
{
  "success": false,
  "message": "At least one service plan ID is required (servicePlanId or servicePlanIds)"
}
```

### Service Not Found
```json
{
  "success": false,
  "message": "Some service plans were not found"
}
```

### Invalid Coordinates
```json
{
  "success": false,
  "message": "Latitude must be between -90 and 90, longitude must be between -180 and 180"
}
```

## Future Enhancements

1. **Service Discounts**: Apply discounts when multiple services are booked
2. **Package Deals**: Pre-defined service combinations with special pricing
3. **Service Dependencies**: Automatically suggest related services
4. **Bulk Booking**: Book same service for multiple dates/locations
5. **Service Scheduling**: Different time slots for different services
