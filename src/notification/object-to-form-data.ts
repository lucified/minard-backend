
import * as FormData from 'form-data';

function objectToFormData(obj: any, form?: FormData, _namespace?: string) {
  const fd = form || new FormData();
  let formKey: string;
  for (const property in obj) {
    if (obj.hasOwnProperty(property)) {

      if (_namespace) {
        formKey = _namespace + '[' + property + ']';
      } else {
        formKey = property;
      }

      // if the property is an object,
      // but not a File, use recursivity.

      if (typeof obj[property] === 'object' && !(obj[property].constructor === 'File')) {
      //if (typeof obj[property] === 'object' && !(obj[property] instanceof File)) {
        objectToFormData(obj[property], fd, formKey);
      } else {
        // if it's a string or a File object
        fd.append(formKey, obj[property]);
      }
    }
  }
  return fd;
};

export default objectToFormData;

