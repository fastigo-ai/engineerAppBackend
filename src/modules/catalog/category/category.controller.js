import STATUS_CODES from '../../../constants/statusCodes.js';
import { Category } from './category.model.js';
import { uploadToCloudinary } from '../../../utils/uploadToCloudinary.js';
import { createCategoryService } from '../../../services/servicePlanService.js';

export const createCategoryController = async (req, res) => {
  try {
    const category = await createCategoryService(req.body, req.file);
    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
  }
};

export const getAllCategoryController = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const match = {};
    if (search) {
      match.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [results] = await Category.aggregate([
      { $match: match },
      { $sort: { name: 1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum }
          ]
        }
      }
    ]);

    const total = results.metadata[0]?.total || 0;

    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      data: results.data,
      pagination: {
        totalCategories: total,
        totalPages: Math.ceil(total / limitNum),
        currentPage: parseInt(page),
        limit: limitNum
      },
      message: 'Categories retrieved successfully'
    });
  } catch (error) {
    console.error('[ServiceController] Get all category error:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

export const updateCategoryImages = async (req, res) => {
  try {
    let { ids } = req.body;
    const files = req.files;

    if (typeof ids === "string") {
      ids = JSON.parse(ids);
    }

    if (!ids || !Array.isArray(ids) || ids.length !== files.length) {
      return res.status(400).json({ message: "IDs and images must match in length" });
    }

    const updatedCategories = [];

    for (let i = 0; i < ids.length; i++) {
      const file = files[i];
      const { url } = await uploadToCloudinary(file.buffer, "categories");

      const updated = await Category.findByIdAndUpdate(
        ids[i],
        { image: url },
        { new: true }
      );

      updatedCategories.push(updated);
    }

    res.json({ success: true, data: updatedCategories });
  } catch (err) {
    console.error("Error updating category images:", err);
    res.status(500).json({ message: "Server error" });
  }
};

export const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    let imageUrl = null;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "categories");
      imageUrl = uploadResult.url;
    }

    const category = await Category.create({
      name,
      description,
      image: imageUrl,
    });

    return res.status(201).json({
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCategory = await Category.findByIdAndDelete(id);
    return res.status(200).json({ success: true, data: deletedCategory });
  }
  catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const { name, description } = req.body;

    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    const updateData = {};

    if (file) {
      const uploadResult = await uploadToCloudinary(file.buffer, "categories");
      updateData.image = uploadResult.url;
    }

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be provided for update"
      });
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory
    });
  }
  catch (error) {
    console.error("Error editing category:", error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};
