# Engineer Onboarding API Documentation

## Overview
This API endpoint is designed to be called by your FastAPI onboarding system after an engineer has been approved. It will add the approved engineer to the main database.

---

## Endpoint Details

### **POST** `/engineer/onboard`

**Purpose**: Add an approved engineer to the database after they've been verified by your onboarding team.

**Authentication**: None required (can be secured with API key if needed)

---

## Request Format

### Headers
```
Content-Type: application/json
```

### Request Body

```json
{
  "name": "John Doe",              // Required: Engineer's full name
  "mobile": "9876543210",          // Required: 10-digit mobile number
  "email": "john@example.com",     // Optional: Valid email address
  "skills": ["Plumbing", "Electrical", "HVAC"],  // Optional: Array of skills
  "address": "123 Main St, City",  // Optional: Full address
  "location": {                    // Optional: GeoJSON format
    "type": "Point",
    "coordinates": [77.5946, 12.9716]  // [longitude, latitude]
  },
  "rating": 4.5,                   // Optional: Initial rating (0-5)
  "isActive": true,                // Optional: Default true
  "isAvailable": true              // Optional: Default true
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | String | ✅ Yes | Engineer's full name |
| `mobile` | String | ✅ Yes | 10-digit mobile number (must be unique) |
| `email` | String | ❌ No | Valid email address |
| `skills` | Array | ❌ No | Array of skill strings |
| `address` | String | ❌ No | Full address of the engineer |
| `location` | Object | ❌ No | GeoJSON Point format with coordinates |
| `rating` | Number | ❌ No | Initial rating (0-5), defaults to 0 |
| `isActive` | Boolean | ❌ No | Account active status, defaults to true |
| `isAvailable` | Boolean | ❌ No | Availability status, defaults to true |

---

## Response Format

### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Engineer onboarded successfully",
  "engineer": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "mobile": "9876543210",
    "email": "john@example.com",
    "skills": ["Plumbing", "Electrical", "HVAC"],
    "address": "123 Main St, City",
    "location": {
      "type": "Point",
      "coordinates": [77.5946, 12.9716]
    },
    "isActive": true,
    "isAvailable": true,
    "rating": 4.5,
    "totalJobs": 0,
    "completedJobs": 0,
    "createdAt": "2025-12-25T05:04:41.000Z",
    "updatedAt": "2025-12-25T05:04:41.000Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Error Responses

#### 400 Bad Request - Missing Required Fields
```json
{
  "success": false,
  "error": "Name and mobile number are required fields"
}
```

#### 400 Bad Request - Invalid Mobile Format
```json
{
  "success": false,
  "error": "Invalid mobile number format. Must be 10 digits."
}
```

#### 400 Bad Request - Invalid Email Format
```json
{
  "success": false,
  "error": "Invalid email format"
}
```

#### 400 Bad Request - Invalid Location Format
```json
{
  "success": false,
  "error": "Invalid location format. Expected GeoJSON format with type and coordinates"
}
```

#### 400 Bad Request - Invalid Skills Format
```json
{
  "success": false,
  "error": "Skills must be an array"
}
```

#### 409 Conflict - Duplicate Engineer
```json
{
  "success": false,
  "error": "Engineer with this mobile number already exists",
  "engineerId": "507f1f77bcf86cd799439011"
}
```

#### 500 Internal Server Error
```json
{
  "success": false,
  "error": "Error message details"
}
```

---

## Example Usage

### Python (FastAPI Integration)

```python
import httpx
import asyncio

async def onboard_engineer_to_main_db(engineer_data):
    """
    Call this function after engineer approval in FastAPI
    """
    url = "http://your-backend-url/engineer/onboard"
    
    payload = {
        "name": engineer_data["name"],
        "mobile": engineer_data["mobile"],
        "email": engineer_data.get("email"),
        "skills": engineer_data.get("skills", []),
        "address": engineer_data.get("address"),
        "location": engineer_data.get("location"),
        "rating": engineer_data.get("rating", 0),
        "isActive": True,
        "isAvailable": True
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        
        if response.status_code == 201:
            result = response.json()
            print(f"Engineer onboarded successfully: {result['engineer']['id']}")
            return result
        elif response.status_code == 409:
            print("Engineer already exists in database")
            return response.json()
        else:
            print(f"Error: {response.json()['error']}")
            raise Exception(response.json()['error'])

# Usage
engineer_data = {
    "name": "John Doe",
    "mobile": "9876543210",
    "email": "john@example.com",
    "skills": ["Plumbing", "Electrical"],
    "address": "123 Main St"
}

asyncio.run(onboard_engineer_to_main_db(engineer_data))
```

### cURL Example

```bash
curl -X POST http://your-backend-url/engineer/onboard \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "mobile": "9876543210",
    "email": "john@example.com",
    "skills": ["Plumbing", "Electrical", "HVAC"],
    "address": "123 Main St, City",
    "location": {
      "type": "Point",
      "coordinates": [77.5946, 12.9716]
    },
    "rating": 4.5
  }'
```

### JavaScript/Node.js Example

```javascript
const axios = require('axios');

async function onboardEngineer(engineerData) {
  try {
    const response = await axios.post(
      'http://your-backend-url/engineer/onboard',
      {
        name: engineerData.name,
        mobile: engineerData.mobile,
        email: engineerData.email,
        skills: engineerData.skills || [],
        address: engineerData.address,
        location: engineerData.location,
        rating: engineerData.rating || 0,
        isActive: true,
        isAvailable: true
      }
    );
    
    console.log('Engineer onboarded:', response.data.engineer.id);
    return response.data;
  } catch (error) {
    if (error.response?.status === 409) {
      console.log('Engineer already exists');
    } else {
      console.error('Error:', error.response?.data?.error);
    }
    throw error;
  }
}
```

---

## Validation Rules

1. **Mobile Number**: 
   - Must be exactly 10 digits
   - Must be unique in the database
   - Only numeric characters allowed

2. **Email**:
   - Must be valid email format
   - Converted to lowercase automatically
   - Optional field

3. **Skills**:
   - Must be an array if provided
   - Can be empty array

4. **Location**:
   - Must be GeoJSON format if provided
   - Requires `type` and `coordinates` fields
   - Example: `{ "type": "Point", "coordinates": [longitude, latitude] }`

5. **Rating**:
   - Must be between 0 and 5
   - Defaults to 0 if not provided

---

## Integration Workflow

```
FastAPI Onboarding System
         |
         | 1. Engineer applies
         v
   Review & Approval
         |
         | 2. After approval
         v
   Call /engineer/onboard API
         |
         | 3. Engineer added to main DB
         v
   Return success + JWT token
         |
         | 4. Engineer can now login
         v
   Engineer uses mobile app
```

---

## Notes

1. **JWT Token**: The response includes a JWT token that can be used immediately if you want to auto-login the engineer.

2. **Duplicate Handling**: If an engineer with the same mobile number already exists, you'll get a 409 error with the existing engineer's ID.

3. **Default Values**: The API automatically sets:
   - `isActive`: true
   - `isAvailable`: true
   - `isDeleted`: false
   - `isBlocked`: false
   - `isSuspended`: false
   - `totalJobs`: 0
   - `completedJobs`: 0

4. **Security**: Consider adding API key authentication to this endpoint to prevent unauthorized access.

---

## Support

For any issues or questions, contact the backend team.
