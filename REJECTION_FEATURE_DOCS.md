# Enhanced Rejection Logic - Feature Documentation

## Overview
Updated the rejection logic to allow engineers to "un-accept" orders they previously accepted by rejecting them.

## New Behavior

### Scenario 1: Engineer Rejects Their Own Accepted Order
**When**: An engineer who previously accepted an order calls the reject endpoint

**What Happens**:
1. ✅ Engineer is removed from `acceptedBy` field (set to `null`)
2. ✅ Engineer is removed from `assignedEngineer` field (set to `null`)
3. ✅ Engineer is added to `rejectedBy` array (if not already present)
4. ✅ Order status is reset to `'Upcoming'`
5. ✅ Work status is reset to `'Upcoming'`
6. ✅ Order becomes available for other engineers to accept

**Example Flow**:
```javascript
// Initial state
order.acceptedBy = engineerId_123
order.assignedEngineer = engineerId_123
order.orderStatus = 'Accepted'
order.rejectedBy = []

// Engineer 123 calls reject endpoint
PUT /api/engineer/requests/reject/:orderId

// Final state
order.acceptedBy = null
order.assignedEngineer = null
order.orderStatus = 'Upcoming'
order.work_status = 'Upcoming'
order.rejectedBy = [engineerId_123]
```

### Scenario 2: Engineer Rejects Order Accepted by Another Engineer
**When**: An engineer tries to reject an order that's already accepted by a different engineer

**What Happens**:
- ❌ Request is rejected with `400 Bad Request`
- ❌ Error message: "Order already accepted by another engineer. Cannot reject."
- ✅ Order state remains unchanged

### Scenario 3: Normal Rejection (Order Not Yet Accepted)
**When**: An engineer rejects an order that hasn't been accepted by anyone

**What Happens**:
1. ✅ Engineer is added to `rejectedBy` array
2. ✅ Order remains in `'Upcoming'` status
3. ✅ Order remains available for other engineers
4. ✅ This engineer won't see this order in their nearby requests anymore

## API Endpoints Affected

### 1. Dedicated Reject Endpoint
```
PUT /api/engineer/requests/reject/:id
```
**Headers**: 
- Authorization: Bearer {engineer_token}

**Response (Success - Own Order)**:
```json
{
  "success": true,
  "message": "Order rejected successfully",
  "data": {
    // Updated order object
    "acceptedBy": null,
    "assignedEngineer": null,
    "orderStatus": "Upcoming",
    "work_status": "Upcoming",
    "rejectedBy": ["engineerId"]
  }
}
```

**Response (Error - Another Engineer's Order)**:
```json
{
  "success": false,
  "message": "Order already accepted by another engineer. Cannot reject."
}
```

### 2. Legacy Status Update Endpoint
```
PUT /api/engineer/requests/status/:id
Body: { "status": "Rejected" }
```
Same behavior as the dedicated endpoint above.

## Use Cases

### Use Case 1: Engineer Changes Mind
An engineer accepts an order but realizes they can't complete it:
1. Engineer calls reject endpoint
2. Order is released back to the pool
3. Other engineers can now see and accept it
4. Original engineer is marked as having rejected it

### Use Case 2: Accidental Acceptance
An engineer accidentally accepts the wrong order:
1. Engineer immediately calls reject endpoint
2. Order becomes available again
3. Engineer can accept a different order

### Use Case 3: Emergency Situation
An engineer accepts an order but has an emergency:
1. Engineer rejects the order
2. System automatically makes it available for reassignment
3. Another engineer can pick it up

## Database Schema Impact

### Order Schema Fields Used
```javascript
{
  acceptedBy: ObjectId | null,        // Single engineer who accepted
  assignedEngineer: ObjectId | null,  // Single engineer assigned
  rejectedBy: [ObjectId],             // Array of engineers who rejected
  orderStatus: String,                // 'Upcoming', 'Accepted', 'Completed', etc.
  work_status: String                 // 'Upcoming', 'Accepted', 'In Progress', etc.
}
```

## Logging

### Console Logs for Un-Accepting
```
=== REJECT REQUEST ===
Order ID: 507f1f77bcf86cd799439011
Engineer ID: 507f191e810c19729de860ea
✅ Order found: 507f1f77bcf86cd799439011
Order acceptedBy: 507f191e810c19729de860ea
Order assignedEngineer: 507f191e810c19729de860ea
Order rejectedBy: []
📝 Engineer is rejecting their own accepted order...
✅ Engineer removed from acceptedBy/assignedEngineer and added to rejectedBy
💾 Saving order...
✅ Order saved successfully
🔍 Fetching updated order with populated fields...
✅ Updated order fetched
✅ Response sent successfully
```

## Testing Checklist

- [ ] Engineer can reject their own accepted order
- [ ] Order status resets to 'Upcoming' after un-acceptance
- [ ] Engineer is added to rejectedBy array
- [ ] acceptedBy and assignedEngineer are set to null
- [ ] Other engineers can now see the order in nearby requests
- [ ] Engineer cannot reject another engineer's accepted order
- [ ] Normal rejection still works for unassigned orders
- [ ] Idempotency: Rejecting already rejected order returns success
- [ ] Legacy endpoint works with same behavior

## Benefits

1. **Flexibility**: Engineers can change their mind after accepting
2. **Better Resource Allocation**: Orders don't get stuck with unavailable engineers
3. **User Experience**: Engineers aren't locked into orders they can't complete
4. **System Reliability**: Automatic reassignment mechanism
5. **Transparency**: Full audit trail in rejectedBy array

## Important Notes

⚠️ **Once an engineer starts working on an order** (work_status = 'In Progress'), they should use the complete endpoint, not reject.

⚠️ **Rejection is different from cancellation**. Rejection makes the order available for others; cancellation would close the order entirely.

✅ **This feature is backward compatible** with existing integrations using the legacy status endpoint.
