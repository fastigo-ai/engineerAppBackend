import { Order } from "../../models/orderSchema.js";
import User from "../../models/user.js";
import { Engineer } from "../../models/engineersModal.js";
import STATUS_CODES from "../../constants/statusCodes.js"; 

// Update Engineer Location
export const updateEngineerLocation = async (req, res) => {
    try {
        const engineerId = req.user.id; // From authenticateEngineer middleware
        const { latitude, longitude } = req.body;

        console.log(engineerId, "    engineerId");
        console.log(latitude, "    latitude");
        console.log(longitude, "    longitude");

        // Validate coordinates
        if (!latitude || !longitude) {
            return res.status(STATUS_CODES.BAD_REQUEST || 400).json({
                success: false,
                message: 'Latitude and Longitude are required'
            });
        }

        // Validate coordinate ranges
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);

        if (isNaN(lat) || isNaN(lng)) {
            return res.status(STATUS_CODES.BAD_REQUEST || 400).json({
                success: false,
                message: 'Invalid latitude or longitude values'
            });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.status(STATUS_CODES.BAD_REQUEST || 400).json({
                success: false,
                message: 'Latitude must be between -90 and 90, longitude must be between -180 and 180'
            });
        }

        // Update engineer location
        const engineer = await Engineer.findByIdAndUpdate(
            engineerId,
            {
                location: {
                    type: 'Point',
                    coordinates: [lng, lat] // GeoJSON format: [longitude, latitude]
                }
            },
            { new: true } // Return updated document
        ).select('-password');

        console.log(engineer, "    engineer");

        if (!engineer) {
            return res.status(STATUS_CODES.NOT_FOUND || 404).json({
                success: false,
                message: 'Engineer not found'
            });
        }

        res.status(STATUS_CODES.SUCCESS || 200).json({
            success: true,
            message: 'Location updated successfully',
            data: {
                id: engineer._id,
                engineerId: engineer.engineerId,
                name: engineer.name,
                location: engineer.location,
                isAvailable: engineer.isAvailable,
                updatedAt: engineer.updatedAt
            }
        });
    } catch (error) {
        console.error('Update location error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR || 500).json({
            success: false,
            message: error.message
        });
    }
};


// Get Nearby Requests for Engineer
export const getNearbyRequests = async (req, res) => {
    try {
        const engineerId = req.user.id;
        const { latitude, longitude, maxDistance = 50000 } = req.query; // maxDistance in meters (default 50km)
        let coordinates = [];

        // If coordinates provided in query, use them
        if (latitude && longitude) {
            coordinates = [parseFloat(longitude), parseFloat(latitude)];
        } else if (engineerId) {
            // Fetch engineer's last known location
            const engineer = await User.findById(engineerId);
            if (!engineer || !engineer.location || !engineer.location.coordinates) {
                return res.status(STATUS_CODES.BAD_REQUEST || 400).json({
                    success: false,
                    message: 'Location not found for engineer. Please provide coordinates.'
                });
            }
            coordinates = engineer.location.coordinates;
        } else {
            return res.status(STATUS_CODES.BAD_REQUEST || 400).json({
                success: false,
                message: 'Engineer ID or Coordinates required'
            });
        }

        const requests = await Order.find({
            status: { $in: ['created', 'paid'] },
            assignedEngineer: null,
            work_status: { $nin: ['Completed', 'Cancelled'] },
            rejectedBy: { $ne: engineerId },
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: coordinates
                    },
                    $maxDistance: parseInt(maxDistance)
                }
            }
        })
            .populate('userId', 'name phone address')
            .populate('servicePlan', 'name')
            .populate('servicePlans', 'name');
        console.log(requests, "    requests");
        res.status(STATUS_CODES.SUCCESS || 200).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get nearby requests error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR || 500).json({
            success: false,
            message: error.message
        });
    }
};

// Accept Request
export const acceptRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const engineerId = req.user.id;

        console.log('=== ACCEPT REQUEST ===');
        console.log('Order ID:', id);
        console.log('Engineer ID:', engineerId);

        // Find the order
        const order = await Order.findById(id);

        if (!order) {
            console.log('❌ Order not found:', id);
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }
        console.log('✅ Order found:', order._id);
        console.log('Order acceptedBy:', order.acceptedBy);
        console.log('Order assignedEngineer:', order.assignedEngineer);
        console.log('Order rejectedBy:', order.rejectedBy);

        // Check if already assigned (accepted by someone)
        if (order.acceptedBy || order.assignedEngineer) {
            console.log('❌ Order already assigned');
            console.log('acceptedBy:', order.acceptedBy);
            console.log('assignedEngineer:', order.assignedEngineer);
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Order already accepted by another engineer.',
                details: {
                    acceptedBy: order.acceptedBy,
                    assignedEngineer: order.assignedEngineer
                }
            });
        }
        console.log('✅ Order is available for assignment');

        console.log('📝 Processing ACCEPTANCE...');

        // Remove engineer from rejectedBy array if they previously rejected this order
        const rejectedByStrings = order.rejectedBy.map(id => id.toString());
        const engineerIdString = engineerId.toString();

        if (rejectedByStrings.includes(engineerIdString)) {
            order.rejectedBy = order.rejectedBy.filter(id => id.toString() !== engineerIdString);
            console.log('✅ Engineer removed from rejectedBy array');
        }

        // Update order status to accepted
        order.status = 'paid';
        order.orderStatus = 'Accepted';
        order.acceptedBy = engineerId;
        order.assignedEngineer = engineerId;
        order.work_status = 'Accepted';
        console.log('✅ Order fields updated for acceptance');
        console.log('✅ Engineer saved in acceptedBy:', engineerId);

        console.log('💾 Saving order...');
        await order.save();
        console.log('✅ Order saved successfully');

        console.log('🔍 Fetching updated order with populated fields...');
        const updatedOrder = await Order.findById(id)
            .populate('userId', 'name phone address')
            .populate('servicePlan', 'name')
            .populate('assignedEngineer', 'name mobile email')
            .populate('acceptedBy', 'name mobile email');
        console.log('✅ Updated order fetched');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: 'Order accepted successfully',
            data: updatedOrder
        });
        console.log('✅ Response sent successfully');
    } catch (error) {
        console.error('❌ ERROR in acceptRequest:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Reject Request
export const rejectRequest = async (req, res) => {
    try {
        const { id } = req.params; // Order ID
        const engineerId = req.user.id;

        console.log('=== REJECT REQUEST ===');
        console.log('Order ID:', id);
        console.log('Engineer ID:', engineerId);

        // Find the order
        const order = await Order.findById(id);

        if (!order) {
            console.log('❌ Order not found:', id);
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }
        console.log('✅ Order found:', order._id);
        console.log('Order acceptedBy:', order.acceptedBy);
        console.log('Order assignedEngineer:', order.assignedEngineer);
        console.log('Order rejectedBy:', order.rejectedBy);

        const engineerIdString = engineerId.toString();

        // Check if this engineer is the one who accepted the order
        const isAcceptedByThisEngineer = order.acceptedBy && order.acceptedBy.toString() === engineerIdString;
        const isAssignedToThisEngineer = order.assignedEngineer && order.assignedEngineer.toString() === engineerIdString;

        if (isAcceptedByThisEngineer || isAssignedToThisEngineer) {
            console.log('📝 Engineer is rejecting their own accepted order...');

            // Remove from acceptedBy and assignedEngineer
            order.acceptedBy = null;
            order.assignedEngineer = null;

            // Reset order status to make it available for other engineers
            order.orderStatus = 'Upcoming';
            order.work_status = 'Upcoming';

            // Add to rejectedBy array if not already present
            const rejectedByStrings = order.rejectedBy.map(id => id.toString());
            if (!rejectedByStrings.includes(engineerIdString)) {
                order.rejectedBy.push(engineerId);
                console.log('✅ Engineer removed from acceptedBy/assignedEngineer and added to rejectedBy');
            } else {
                console.log('✅ Engineer removed from acceptedBy/assignedEngineer (already in rejectedBy)');
            }
        } else if (order.acceptedBy || order.assignedEngineer) {
            // Order is assigned to a different engineer
            console.log('❌ Order already assigned to another engineer');
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Order already accepted by another engineer. Cannot reject.'
            });
        } else {
            // Order is not assigned to anyone, normal rejection
            console.log('📝 Processing normal REJECTION...');

            // Convert ObjectIds to strings for comparison
            const rejectedByStrings = order.rejectedBy.map(id => id.toString());

            console.log('Current rejectedBy array:', rejectedByStrings);
            console.log('Engineer attempting to reject:', engineerIdString);

            // Add to rejectedBy array if not already present
            if (!rejectedByStrings.includes(engineerIdString)) {
                order.rejectedBy.push(engineerId);
                console.log('✅ Engineer added to rejectedBy array');
            } else {
                console.log('ℹ️ Engineer already in rejectedBy array');
                return res.status(STATUS_CODES.SUCCESS).json({
                    success: true,
                    message: 'Order already rejected by you',
                    data: order
                });
            }
        }

        // Keep orderStatus as 'Upcoming' so other engineers can still accept it
        console.log(`✅ Engineer ${engineerId} rejected order ${id}`);

        console.log('💾 Saving order...');
        await order.save();
        console.log('✅ Order saved successfully');

        console.log('🔍 Fetching updated order with populated fields...');
        const updatedOrder = await Order.findById(id)
            .populate('userId', 'name phone address')
            .populate('servicePlan', 'name');
        console.log('✅ Updated order fetched');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: 'Order rejected successfully',
            data: updatedOrder
        });
        console.log('✅ Response sent successfully');
    } catch (error) {
        console.error('❌ ERROR in rejectRequest:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Complete Request
export const completeRequest = async (req, res) => {
    try {
        const { id } = req.params; // Order ID
        const engineerId = req.user.id;

        console.log('=== COMPLETE REQUEST ===');
        console.log('Order ID:', id);
        console.log('Engineer ID:', engineerId);

        // Find the order
        const order = await Order.findById(id);

        if (!order) {
            console.log('❌ Order not found:', id);
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }
        console.log('✅ Order found:', order._id);
        console.log('Order assignedEngineer:', order.assignedEngineer);
        console.log('Order work_status:', order.work_status);

        console.log('📝 Processing COMPLETION...');

        // Verify that the logged-in engineer is assigned to this order
        if (!order.assignedEngineer || order.assignedEngineer.toString() !== engineerId.toString()) {
            console.log('❌ Engineer not assigned to this order');
            return res.status(STATUS_CODES.FORBIDDEN).json({
                success: false,
                message: 'You are not assigned to this order.'
            });
        }

        // Check if already completed
        if (order.work_status === 'Completed' || order.orderStatus === 'Completed') {
            console.log('ℹ️ Order already completed');
            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: 'Order already completed',
                data: order
            });
        }

        // Update order to completed
        order.status = 'paid'; // or 'completed' if that enum exists
        order.orderStatus = 'Completed';
        order.work_status = 'Completed';
        console.log('✅ Order fields updated for completion');

        console.log('💾 Saving order...');
        await order.save();
        console.log('✅ Order saved successfully');

        console.log('🔍 Fetching updated order with populated fields...');
        const updatedOrder = await Order.findById(id)
            .populate('userId', 'name phone address')
            .populate('servicePlan', 'name')
            .populate('assignedEngineer', 'name mobile email')
            .populate('acceptedBy', 'name mobile email');
        console.log('✅ Updated order fetched');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: 'Order completed successfully',
            data: updatedOrder
        });
        console.log('✅ Response sent successfully');
    } catch (error) {
        console.error('❌ ERROR in completeRequest:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

// Legacy function - kept for backward compatibility
export const updateRequestStatus = async (req, res) => {
    try {
        const { id } = req.params; // Order ID
        const { status } = req.body; // 'Accepted', 'Rejected', or 'Completed'
        const engineerId = req.user.id;

        console.log('=== UPDATE REQUEST STATUS ===');
        console.log('Order ID:', id);
        console.log('Status:', status);
        console.log('Engineer ID:', engineerId);
        console.log('Request Body:', req.body);

        // Validate status input
        if (!['Accepted', 'Rejected', 'Completed'].includes(status)) {
            console.log('❌ Invalid status:', status);
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Invalid status. Must be Accepted, Rejected, or Completed.'
            });
        }
        console.log('✅ Status validation passed');

        // Find the order
        const order = await Order.findById(id);

        if (!order) {
            console.log('❌ Order not found:', id);
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }
        console.log('✅ Order found:', order._id);
        console.log('Order acceptedBy:', order.acceptedBy);
        console.log('Order assignedEngineer:', order.assignedEngineer);
        console.log('Order rejectedBy:', order.rejectedBy);
        console.log('Order work_status:', order.work_status);

        // Handle Completed status separately
        if (status === 'Completed') {
            console.log('📝 Processing COMPLETION...');

            // Verify that the logged-in engineer is assigned to this order
            if (!order.assignedEngineer || order.assignedEngineer.toString() !== engineerId.toString()) {
                console.log('❌ Engineer not assigned to this order');
                return res.status(STATUS_CODES.FORBIDDEN).json({
                    success: false,
                    message: 'You are not assigned to this order.'
                });
            }

            // Update order to completed
            order.status = 'paid'; // or 'completed' if that enum exists
            order.orderStatus = 'Completed';
            order.work_status = 'Completed';
            console.log('✅ Order fields updated for completion');
        } else {
            // For Accepted and Rejected statuses
            const engineerIdString = engineerId.toString();
            const isAcceptedByThisEngineer = order.acceptedBy && order.acceptedBy.toString() === engineerIdString;
            const isAssignedToThisEngineer = order.assignedEngineer && order.assignedEngineer.toString() === engineerIdString;

            // Special case: Engineer is rejecting their own accepted order
            if (status === 'Rejected' && (isAcceptedByThisEngineer || isAssignedToThisEngineer)) {
                console.log('📝 Engineer is rejecting their own accepted order...');

                // Remove from acceptedBy and assignedEngineer
                order.acceptedBy = null;
                order.assignedEngineer = null;

                // Reset order status to make it available for other engineers
                order.orderStatus = 'Upcoming';
                order.work_status = 'Upcoming';

                // Add to rejectedBy array if not already present
                const rejectedByStrings = order.rejectedBy.map(id => id.toString());
                if (!rejectedByStrings.includes(engineerIdString)) {
                    order.rejectedBy.push(engineerId);
                    console.log('✅ Engineer removed from acceptedBy/assignedEngineer and added to rejectedBy');
                } else {
                    console.log('✅ Engineer removed from acceptedBy/assignedEngineer (already in rejectedBy)');
                }
            } else if (order.acceptedBy || order.assignedEngineer) {
                // Order is assigned to someone (and not the current engineer trying to reject)
                console.log('❌ Order already assigned');
                console.log('acceptedBy:', order.acceptedBy);
                console.log('assignedEngineer:', order.assignedEngineer);
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    success: false,
                    message: 'Order already accepted by another engineer.',
                    details: {
                        acceptedBy: order.acceptedBy,
                        assignedEngineer: order.assignedEngineer
                    }
                });
            } else {
                console.log('✅ Order is available for assignment');
            }

            if (status === 'Accepted') {
                console.log('📝 Processing ACCEPTANCE...');

                // Remove engineer from rejectedBy array if they previously rejected this order
                const rejectedByStrings = order.rejectedBy.map(id => id.toString());
                const engineerIdString = engineerId.toString();

                if (rejectedByStrings.includes(engineerIdString)) {
                    order.rejectedBy = order.rejectedBy.filter(id => id.toString() !== engineerIdString);
                    console.log('✅ Engineer removed from rejectedBy array');
                }

                // Update order status to accepted
                order.status = 'paid';
                order.orderStatus = 'Accepted';
                order.acceptedBy = engineerId;
                order.assignedEngineer = engineerId;
                order.work_status = 'Accepted'; // Update work_status as well
                console.log('✅ Order fields updated for acceptance');
                console.log('✅ Engineer saved in acceptedBy:', engineerId);
            } else if (status === 'Rejected' && !isAcceptedByThisEngineer && !isAssignedToThisEngineer) {
                // Normal rejection (not un-accepting own order)
                console.log('📝 Processing normal REJECTION...');
                // Convert ObjectIds to strings for comparison
                const rejectedByStrings = order.rejectedBy.map(id => id.toString());
                const engineerIdString = engineerId.toString();

                console.log('Current rejectedBy array:', rejectedByStrings);
                console.log('Engineer attempting to reject:', engineerIdString);

                // Add to rejectedBy array if not already present
                if (!rejectedByStrings.includes(engineerIdString)) {
                    order.rejectedBy.push(engineerId);
                    console.log('✅ Engineer added to rejectedBy array');
                } else {
                    console.log('ℹ️ Engineer already in rejectedBy array');
                }

                // Keep orderStatus as 'Upcoming' so other engineers can still accept it
                console.log(`✅ Engineer ${engineerId} rejected order ${id}`);
            }
        }

        console.log('💾 Saving order...');
        await order.save();
        console.log('✅ Order saved successfully');

        console.log('🔍 Fetching updated order with populated fields...');
        const updatedOrder = await Order.findById(id)
            .populate('userId', 'name phone address')
            .populate('servicePlan', 'name')
            .populate('assignedEngineer', 'name mobile email')
            .populate('acceptedBy', 'name mobile email');
        console.log('✅ Updated order fetched');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: `Order ${status.toLowerCase()} successfully`,
            data: updatedOrder
        });
        console.log('✅ Response sent successfully');
    } catch (error) {
        console.error('❌ ERROR in updateRequestStatus:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        // Provide more detailed error information
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

export const getAcceptedRequests = async (req, res) => {
    try {
        const engineerId = req.user.id;

        const requests = await Order.find({
            assignedEngineer: engineerId,
            orderStatus: 'Accepted'
        }).populate('userId', 'name phone address').populate('servicePlan', 'name');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get accepted requests error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};

export const getRejectedRequests = async (req, res) => {
    try {
        const engineerId = req.user.id;

        const requests = await Order.find({
            rejectedBy: engineerId // Check if engineerId is in rejectedBy array
        }).populate('userId', 'name phone address').populate('servicePlan', 'name');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get rejected requests error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};

// Update Work Status (Started, Completed, etc.)
export const updateWorkStatus = async (req, res) => {
    try {
        const { id } = req.params; // Order ID
        const { work_status } = req.body; // 'In Progress', 'Completed', 'Cancelled'
        const engineerId = req.user.id;
        console.log(id, work_status, engineerId, "    id, work_status, engineerId");

        const validStatuses = ['In Progress', 'Completed', 'Cancelled'];
        if (!validStatuses.includes(work_status)) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: `Invalid work status. Must be one of: ${validStatuses.join(', ')}`
            });
        }

        const order = await Order.findById(id);

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Verify that the logged-in engineer acts on this order
        console.log(`Order Engineer: ${order.assignedEngineer}, Auth User: ${engineerId}`);
        if (!order.assignedEngineer || order.assignedEngineer.toString() !== engineerId.toString()) {
            return res.status(STATUS_CODES.FORBIDDEN).json({
                success: false,
                message: 'You are not assigned to this order.'
            });
        }

        order.work_status = work_status;

        // Optionally sync with main status if needed
        if (work_status === 'Completed') {
            order.status = 'paid'; // or 'completed' if that enum exists
            order.orderStatus = 'Completed';
        } else if (work_status === 'Cancelled') {
            order.orderStatus = 'Cancelled';
        }

        await order.save();

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: `Work status updated to ${work_status}`,
            data: order
        });
    } catch (error) {
        console.error('Update work status error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};

// Get Completed Requests
export const getCompletedRequests = async (req, res) => {
    try {
        const engineerId = req.user.id;

        const requests = await Order.find({
            assignedEngineer: engineerId,
            orderStatus: 'Completed'
        }).populate('userId', 'name phone address').populate('servicePlan', 'name');

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (error) {
        console.error('Get completed requests error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message
        });
    }
};


