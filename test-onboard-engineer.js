/**
 * Test file for Engineer Onboarding API
 * Run with: node test-onboard-engineer.js
 */

const testOnboardEngineer = async () => {
    const BASE_URL = 'http://localhost:3000'; // Update with your server URL

    // Test Case 1: Successful onboarding
    console.log('\n=== Test 1: Successful Engineer Onboarding ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Rajesh Kumar',
                mobile: '9876543210',
                email: 'rajesh.kumar@example.com',
                skills: ['Plumbing', 'Electrical', 'HVAC'],
                address: '123 MG Road, Bangalore, Karnataka',
                location: {
                    type: 'Point',
                    coordinates: [77.5946, 12.9716] // Bangalore coordinates
                },
                rating: 4.5
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 2: Missing required fields
    console.log('\n=== Test 2: Missing Required Fields ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email: 'test@example.com'
                // Missing name and mobile
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 3: Invalid mobile format
    console.log('\n=== Test 3: Invalid Mobile Format ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Test Engineer',
                mobile: '123', // Invalid format
                email: 'test@example.com'
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 4: Duplicate engineer
    console.log('\n=== Test 4: Duplicate Engineer (same mobile) ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Another Engineer',
                mobile: '9876543210', // Same as Test 1
                email: 'another@example.com'
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 5: Minimal data (only required fields)
    console.log('\n=== Test 5: Minimal Data (Only Required Fields) ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Minimal Engineer',
                mobile: '9123456789'
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 6: Invalid email format
    console.log('\n=== Test 6: Invalid Email Format ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Test Engineer',
                mobile: '9234567890',
                email: 'invalid-email' // Invalid format
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 7: Invalid skills format
    console.log('\n=== Test 7: Invalid Skills Format ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Test Engineer',
                mobile: '9345678901',
                skills: 'Plumbing' // Should be array, not string
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    // Test Case 8: Invalid location format
    console.log('\n=== Test 8: Invalid Location Format ===');
    try {
        const response = await fetch(`${BASE_URL}/engineer/onboard`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: 'Test Engineer',
                mobile: '9456789012',
                location: {
                    lat: 12.9716,
                    lng: 77.5946
                } // Wrong format, should be GeoJSON
            })
        });

        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error:', error.message);
    }

    console.log('\n=== All Tests Completed ===\n');
};

// Run tests
testOnboardEngineer().catch(console.error);
