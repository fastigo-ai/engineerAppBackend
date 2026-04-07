import { Order } from "../../models/orderSchema.js";
import User from "../../models/user.js";
import { Engineer } from "../../models/engineersModal.js";
import STATUS_CODES from "../../constants/statusCodes.js";
import vendorOrderModal from "../../models/vendorOrderModal.js";
import mongoose from "mongoose";
import { getDistanceInMeters } from "../../utils/distance.js";
import razorpay from "../../config/razorpay.js";
import { notifyEngineersForOrder } from "../../services/notificationEngineerService.js";


// Controller functions follow

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

        // 2. Fetch Regular Orders
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
            .populate('servicePlans', 'name')
            .lean();

        // 3. Fetch Vendor Orders
        const vendorRequests = await vendorOrderModal.aggregate([
            {
                $geoNear: {
                    near: { type: 'Point', coordinates: coordinates },
                    distanceField: 'distance',
                    maxDistance: parseInt(maxDistance),
                    query: {
                        status: 'PENDING',
                        assigned_engineer_id: null,
                        rejected_engineers: { $ne: new mongoose.Types.ObjectId(engineerId) }
                    },
                    spherical: true
                }
            },
            {
                $project: {
                    _id: 1,
                    customerDetails: {
                        name: { $ifNull: ["$contact_name", "$l1_support_name"] },
                        phone: { $ifNull: ["$contact_phone", "$l1_support_number"] },
                        email: { $literal: "vendor@order.com" }
                    },
                    servicePlan: { name: "$support_type" },
                    amount: "$order_price",
                    orderStatus: "Upcoming",
                    work_status: "$work_status",
                    location: "$location",
                    createdAt: "$created_at",
                    updatedAt: "$updated_at",
                    address: "$complete_address",
                    pincode: "$pincode",
                    notes: {
                        orderId: "$call_id",
                        serviceCount: "$assets_count"
                    },
                    isVendorOrder: { $literal: true }
                }
            }
        ]);

        const mappedRequests = requests.map(order => {
            const orderCoords = order.location?.coordinates;
            let distance = "TBD";
            if (orderCoords && coordinates.length === 2) {
                const d = getDistanceInMeters(coordinates[1], coordinates[0], orderCoords[1], orderCoords[0]);
                distance = (d / 1000).toFixed(2);
            }
            return { ...order, distance };
        });

        const mappedVendorRequests = vendorRequests.map(order => {
            const orderCoords = order.location?.coordinates;
            let distance = "TBD";
            if (orderCoords && coordinates.length === 2) {
                const d = getDistanceInMeters(coordinates[1], coordinates[0], orderCoords[1], orderCoords[0]);
                distance = (d / 1000).toFixed(2);
            }
            return { ...order, distance };
        });

        res.status(STATUS_CODES.SUCCESS || 200).json({
            requests: {
                success: true,
                count: mappedRequests.length,
                data: mappedRequests
            },
            vendorOrders: {
                success: true,
                count: mappedVendorRequests.length,
                orders: mappedVendorRequests
            }
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

            // Check if we should re-dispatch (scheduled time is in the future)
            const now = new Date();
            const scheduledAt = order.scheduledAt ? new Date(order.scheduledAt) : null;
            let shouldReDispatch = false;

            if (scheduledAt && now < scheduledAt) {
                order.status = 'Searching'; // Reset to Searching status
                shouldReDispatch = true;
                console.log('✅ Order scheduled in future, resetting to Searching for re-dispatch');
            }

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
        if (typeof shouldReDispatch !== 'undefined' && shouldReDispatch) {
            await notifyEngineersForOrder(order);
        }

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

        // For user orders, ensure OTP is verified before completion
        if (!order.isOtpVerified) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'OTP must be verified before completing the request.'
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

                // Check if we should re-dispatch (scheduled time is in the future)
                const now = new Date();
                const scheduledAt = order.scheduledAt ? new Date(order.scheduledAt) : null;
                var shouldReDispatchLegacy = false;

                if (scheduledAt && now < scheduledAt) {
                    order.status = 'Searching'; // Reset to Searching status
                    shouldReDispatchLegacy = true;
                    console.log('✅ Order scheduled in future, resetting to Searching for re-dispatch');
                }

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
                order.status = 'pending';
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
        if (typeof shouldReDispatchLegacy !== 'undefined' && shouldReDispatchLegacy) {
            await notifyEngineersForOrder(order);
        }

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
        const { latitude, longitude } = req.query;

        // 1. STACK TRACE & VALIDATION
        // If the app doesn't send coordinates, we stop early.
        if (!latitude || !longitude) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: "Current location (latitude and longitude) is required to calculate distances."
            });
        }

        const latNum = parseFloat(latitude);
        const lngNum = parseFloat(longitude);

        // 2. Fetch Direct Orders
        const requests = await Order.find({
            assignedEngineer: engineerId,
            orderStatus: 'Accepted'
        })
            .populate('userId', 'name phone address')
            .populate('servicePlan', 'name')
            .lean();

        // 5. Final Sort (Closest distance first)
        requests.sort((a, b) => (a.distance || 0) - (b.distance || 0));

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
            rejectedBy: engineerId
        }).populate('userId', 'name phone address').populate('servicePlan', 'name').lean();

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

        if (!work_status) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Work status is required'
            });
        }

        // 1. Try updating regular Order first
        let order = await Order.findById(id);
        if (order) {
            const validStatuses = ['In Progress', 'Completed', 'Cancelled'];
            if (!validStatuses.includes(work_status)) {
                return res.status(STATUS_CODES.BAD_REQUEST).json({
                    success: false,
                    message: `Invalid work status. Must be one of: ${validStatuses.join(', ')}`
                });
            }

            if (!order.assignedEngineer || order.assignedEngineer.toString() !== engineerId.toString()) {
                return res.status(STATUS_CODES.FORBIDDEN).json({
                    success: false,
                    message: 'You are not assigned to this order.'
                });
            }

            if (work_status === 'In Progress' || work_status === 'started' || work_status === 'started_work') {
                const now = new Date();
                const scheduledTime = order.scheduledAt ? new Date(order.scheduledAt) : null;

                if (scheduledTime && now < scheduledTime) {
                    const diffMs = scheduledTime.getTime() - now.getTime();
                    const diffMins = Math.ceil(diffMs / (1000 * 60));

                    return res.status(STATUS_CODES.BAD_REQUEST).json({
                        success: false,
                        message: `Cannot start work yet. Scheduled time is in ${diffMins} minutes.`
                    });
                }
            }

            order.work_status = work_status;
            if (work_status === 'Completed') {
                if (!order.isOtpVerified) {
                    return res.status(STATUS_CODES.BAD_REQUEST).json({
                        success: false,
                        message: 'OTP must be verified before completing the request.'
                    });
                }
                order.status = 'paid';
                order.orderStatus = 'Completed';

                // --- NEW: CREDIT WALLET FOR COMPLETED WORK ---
                try {
                    const { creditEngineerWallet } = await import('../../services/walletService.js');
                    const payoutAmount = order.totalAmount || order.amount || 0;
                    
                    if (payoutAmount > 0) {
                        await creditEngineerWallet({
                            engineerId,
                            amount: payoutAmount,
                            orderId: order._id.toString(),
                            category: 'earning'
                        });
                        console.log(`Credited ₹${payoutAmount} to wallet for engineer ${engineerId}`);
                    }
                } catch (creditError) {
                    console.error("Failed to credit wallet during order completion:", creditError);
                    // We don't block order completion if wallet credit fails, as it's recorded in logs
                }
                // ----------------------------------------------
            } else if (work_status === 'Cancelled') {
                order.orderStatus = 'Cancelled';
            }

            await order.save();
            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: `Work status updated to ${work_status}`,
                data: order
            });
        }

        // 2. Try updating Vendor Order if regular Order not found
        // Convert to vendor format if needed, e.g., "In Progress" -> "IN_PROGRESS"
        const vendorWorkStatus = work_status.toUpperCase().replace(/\s+/g, '_');
        const vendorOrder = await vendorOrderModal.findOneAndUpdate(
            { _id: id, assigned_engineer_id: engineerId },
            { work_status: vendorWorkStatus },
            { new: true }
        );

        if (vendorOrder) {
            // If completed, sync main status too
            if (work_status === 'Completed') {
                await vendorOrderModal.findByIdAndUpdate(id, { status: 'COMPLETED' });
            }

            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: `Vendor order work status updated to ${work_status}`,
                data: vendorOrder
            });
        }

        return res.status(STATUS_CODES.NOT_FOUND).json({
            success: false,
            message: 'Order not found in regular or vendor collections'
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
        }).populate('userId', 'name phone address').populate('servicePlan', 'name').lean();

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

// Send Completion OTP
export const sendCompletionOTP = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id).populate('userId', 'phone');

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false, message: 'Order not found'
            });
        }

        // Generate 4-digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000).toString();
        order.completionOtp = otp;
        await order.save();

        // Simulated SMS sending
        console.log(`[SIMULATED SMS] OTP for Order ${order.orderId} sent to ${order.userId?.phone}: ${otp}`);

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            message: 'OTP sent to user successfully'
        });
    } catch (error) {
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false, message: error.message
        });
    }
};

// Verify Completion OTP
export const verifyCompletionOTP = async (req, res) => {
    try {
        const { id } = req.params;
        const { otp } = req.body;
        const order = await Order.findById(id);

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false, message: 'Order not found'
            });
        }

        if (order.completionOtp === otp) {
            order.isOtpVerified = true;
            order.completionOtp = null; // Clear OTP after verification
            await order.save();
            return res.status(STATUS_CODES.SUCCESS).json({
                success: true,
                message: 'OTP verified successfully'
            });
        } else {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Invalid OTP'
            });
        }
    } catch (error) {
        console.error('Verify completion OTP error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false, message: error.message
        });
    }
};

// Generate Payment QR Code (Razorpay)
export const generatePaymentQRCode = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id);

        if (!order) {
            return res.status(STATUS_CODES.NOT_FOUND).json({
                success: false, message: 'Order not found'
            });
        }

        // Only generate Razorpay QR if it's "Payment After Service" (Case-insensitive)
        const isPAS = order.paymentMode &&
            order.paymentMode.toString().toLowerCase().trim() === 'payment after service';

        if (!isPAS) {
            return res.status(STATUS_CODES.BAD_REQUEST).json({
                success: false,
                message: 'Razorpay QR is only available for Payment After Service orders.'
            });
        }

        const amountInPaise = Math.round(order.amount * 100);

        // Generate Razorpay QR Code
        const qrCode = await razorpay.qrCode.create({
            type: 'upi_qr',
            name: `Door2fy Order ${order.orderId}`,
            usage: 'single_use',
            fixed_amount: true,
            payment_amount: amountInPaise,
            description: `Payment for Order #${order.orderId}`,
            notes: {
                orderId: order._id.toString(),
                orderNumber: order.orderId
            }
        });

        res.status(STATUS_CODES.SUCCESS).json({
            success: true,
            data: {
                qrId: qrCode.id,
                imageUrl: qrCode.image_url,
                paymentUrl: qrCode.payment_url // UPI deep link
            }
        });
    } catch (error) {
        console.error('Generate Razorpay QR error:', error);
        res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: error.message || 'Failed to generate Razorpay QR code'
        });
    }
};


