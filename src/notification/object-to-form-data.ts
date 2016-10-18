
import * as FormData from 'form-data';

// adapted from https://gist.github.com/ghinda/8442a57f22099bdb2e34
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
      if (typeof obj[property] === 'object' && !(obj[property].constructor === 'File')) {
        objectToFormData(obj[property], fd, formKey);
      } else {
        fd.append(formKey, obj[property]);
      }
    }
  }
  return fd;
};

export default objectToFormData;
