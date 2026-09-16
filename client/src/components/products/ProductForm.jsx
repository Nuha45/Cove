import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { compressImage } from '../../utils/images';
import { mediaUrl } from '../../utils/media';

const CATEGORY_SUGGESTIONS = [
  'Necklaces',
  'Earrings',
  'Rings',
  'Baked goods',
  'Meals',
  'Clothing',
  'Art',
  'Henna',
  'Classes',
];

export const emptyProductForm = {
  name: '',
  price: '',
  stockQuantity: '',
  category: '',
  description: '',
  status: 'Active',
  images: [],
};

export function formFromProduct(product) {
  return {
    name: product.name,
    price: String(product.price),
    stockQuantity: String(product.stockQuantity),
    category: product.category || '',
    description: product.description || '',
    status: product.status,
    images: product.images || [],
  };
}

export function productFieldErrors(form) {
  const errors = {};
  const name = form.name.trim();
  if (name.length < 2 || name.length > 80) {
    errors.name = 'Name must be between 2 and 80 characters.';
  }

  if (form.price === '' || !Number.isFinite(Number(form.price))) {
    errors.price = 'Please enter a valid price.';
  } else if (Number(form.price) < 0) {
    errors.price = 'Price cannot be negative.';
  } else if (Number(form.price) > 10000000) {
    errors.price = 'That price is too high.';
  }

  if (form.stockQuantity === '') {
    errors.stockQuantity = 'Please enter a stock quantity.';
  } else if (!Number.isInteger(Number(form.stockQuantity))) {
    errors.stockQuantity = 'Stock must be a whole number.';
  } else if (Number(form.stockQuantity) < 0) {
    errors.stockQuantity = 'Stock cannot be negative.';
  }

  if (form.description.length > 500) {
    errors.description = 'Description must be 500 characters or fewer.';
  }
  if (form.category.trim().length > 40) {
    errors.category = 'Category must be 40 characters or fewer.';
  }
  if (form.images.length > 4) {
    errors.images = 'You can add up to 4 images.';
  }
  return errors;
}

export function productPayload(form) {
  return {
    name: form.name.trim(),
    price: Number(form.price),
    stockQuantity: Number(form.stockQuantity),
    category: form.category.trim(),
    description: form.description.trim(),
    status: form.status,
    images: form.images,
  };
}

export default function ProductForm({
  form,
  errors,
  formError,
  submitting,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}) {
  const fileInput = useRef(null);
  const [imageError, setImageError] = useState('');
  const statusOptions = form.status === 'Archived'
    ? ['Archived', 'Active', 'Draft']
    : ['Active', 'Draft'];

  function update(event) {
    onChange({ ...form, [event.target.name]: event.target.value });
  }

  async function addImages(event) {
    const files = [...event.target.files];
    event.target.value = '';
    setImageError('');
    if (!files.length) return;
    if (form.images.length + files.length > 4) {
      setImageError('You can add up to 4 images.');
      return;
    }

    try {
      const next = [];
      for (const file of files) {
        next.push(await compressImage(file));
      }
      onChange({ ...form, images: [...form.images, ...next] });
    } catch (err) {
      setImageError(err.message);
    }
  }

  function removeImage(index) {
    onChange({
      ...form,
      images: form.images.filter((_, itemIndex) => itemIndex !== index),
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {formError ? <p className="form-error">{formError}</p> : null}
      <div className="form-grid">
        <label className="wide">
          Product name
          <input
            name="name"
            value={form.name}
            onChange={update}
            placeholder="e.g. Pearl Drop Necklace"
            autoFocus
            maxLength={80}
          />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>
        <label>
          Price
          <input
            name="price"
            value={form.price}
            onChange={update}
            placeholder="₹ 0"
            inputMode="decimal"
          />
          {errors.price ? <span className="field-error">{errors.price}</span> : null}
        </label>
        <label>
          Stock quantity
          <input
            name="stockQuantity"
            value={form.stockQuantity}
            onChange={update}
            placeholder="0"
            inputMode="numeric"
          />
          {errors.stockQuantity ? <span className="field-error">{errors.stockQuantity}</span> : null}
        </label>
        <label>
          Category
          <input
            name="category"
            value={form.category}
            onChange={update}
            placeholder="Optional"
            list="product-categories"
            maxLength={40}
          />
          <datalist id="product-categories">
            {CATEGORY_SUGGESTIONS.map((item) => <option value={item} key={item} />)}
          </datalist>
          {errors.category ? <span className="field-error">{errors.category}</span> : null}
        </label>
        <label>
          Status
          <select name="status" value={form.status} onChange={update}>
            {statusOptions.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label className="wide">
          Description
          <textarea
            name="description"
            value={form.description}
            onChange={update}
            placeholder="Tell customers what makes this special..."
            maxLength={500}
          />
          {errors.description ? <span className="field-error">{errors.description}</span> : null}
        </label>
        <div className="wide">
          <button className="upload-box" type="button" onClick={() => fileInput.current?.click()}>
            <ImagePlus size={24} />
            <strong>Add product images</strong>
            <small>JPG, PNG, or WebP · up to 4</small>
          </button>
          <input
            ref={fileInput}
            className="product-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={addImages}
          />
          {errors.images || imageError ? (
            <span className="field-error">{errors.images || imageError}</span>
          ) : null}
          {form.images.length ? (
            <div className="image-previews">
              {form.images.map((image, index) => (
                <figure key={`${image.slice(0, 24)}-${index}`}>
                  <img src={mediaUrl(image)} alt="" />
                  <button type="button" aria-label="Remove image" onClick={() => removeImage(index)}>
                    <X size={12} />
                  </button>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="modal-actions">
        <button className="secondary" type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
