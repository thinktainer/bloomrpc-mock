import {UntypedServiceImplementation} from 'grpc';
import { Enum, Field, MapField, Message, Service, Type } from 'protobufjs';
import * as uuid from 'uuid';

export interface MethodPayload {
  plain: {[key: string]: any};
  message: Message;
}

export type ServiceMethodsPayload = {
  [name: string]: () => MethodPayload
};

const enum MethodType {
  request,
  response
}

/**
 * Mock a service
 */
export function mockServiceMethods(
  service: Service,
  mocks?: void | {},
): UntypedServiceImplementation {
  const mockedMethodsPayloads = mockResponseMethods(service, mocks);

  return Object.keys(mockedMethodsPayloads).reduce((methods: UntypedServiceImplementation, method: string) => {
    methods[method] = (call: any, callback: any) => {
      const getMockPayload = mockedMethodsPayloads[method];

      // Client side streaming
      if (service.methods[method].requestStream) {
        call.on('data', (data: any) => {
          console.log('Received data: ', data);
        });

        call.on('end', () => {
          const {message} = getMockPayload();
          if (!service.methods[method].responseStream) {
            callback(null, message);
          }
        });

        if (!service.methods[method].responseStream) {
          return;
        }
      }

      // Server side streaming
      if (service.methods[method].responseStream) {
        const pushInterval = setInterval(function () {
          const getMockPayload = mockedMethodsPayloads[method];
          const {message} = getMockPayload();
          call.write(message);
        }, 1000);

        setTimeout(function () {
          clearInterval(pushInterval);
          call.end();
        }, 10000);

        return;
      }

      const {message} = getMockPayload();
      callback(null, message);
    };

    return methods;
  }, {});
}

/**
 * Mock method response
 */
export function mockResponseMethods(
  service: Service,
  mocks?: void | {},
) {
  return mockMethodReturnType(
    service,
    MethodType.response,
    mocks
  );
}

/**
 * Mock methods request
 */
export function mockRequestMethods(
  service: Service,
  mocks?: void | {},
) {
  return mockMethodReturnType(
    service,
    MethodType.request,
    mocks
  );
}

function mockMethodReturnType(
  service: Service,
  type: MethodType,
  mocks?: void | {},
): ServiceMethodsPayload {
  const root = service.root;
  const serviceMethods = service.methods;

  return Object.keys(serviceMethods).reduce((methods: ServiceMethodsPayload, method: string) => {
    const serviceMethod = serviceMethods[method];

    const methodMessageType = type === MethodType.request
      ? serviceMethod.requestType
      : serviceMethod.responseType;

    const messageType = root.lookupType(methodMessageType);

    methods[method] = () => {
      let data = {};
      if (!mocks) {
        data = mockTypeFields(messageType);
      }
      return {plain: data, message: messageType.fromObject(data)};
    };

    return methods;
  }, {});
}

/**
 * Mock a field type
 */
function mockTypeFields(type: Type): object {
  const fieldsData: { [key: string]: any } = {};

  return type.fieldsArray.reduce((data, field) => {
    field.resolve();
    if (field.repeated) {
      data[field.name] = [mockField(field)];
    } else {
      data[field.name] = mockField(field);
    }
    return data;
  }, fieldsData);
}

/**
 * Mock enum
 */
function mockEnum(enumType: Enum): number {
  const enumKey = Object.keys(enumType.values)[0];

  return enumType.values[enumKey];
}

/**
 * Mock a field
 */
function mockField(field: Field): any {
  if (field instanceof MapField) {
    let mockPropertyValue = mockScalar(field.type, field.name);

    if (mockPropertyValue === null) {
      const resolvedType = field.resolvedType;
      if (resolvedType instanceof Type) {
        mockPropertyValue = mockTypeFields(resolvedType);
      } else if (resolvedType instanceof Enum) {
        mockPropertyValue = mockEnum(resolvedType);
      } else if (resolvedType === null) {
        mockPropertyValue = {};
      }
    }

    return {
      [mockScalar(field.keyType, field.name)]: mockPropertyValue,
    };
  }

  if (field.resolvedType instanceof Type) {
    return mockTypeFields(field.resolvedType);
  }

  if (field.resolvedType instanceof Enum) {
    return mockEnum(field.resolvedType);
  }

  const mockPropertyValue = mockScalar(field.type, field.name);

  if (mockPropertyValue === null) {
    const resolvedField = field.resolve();
    return mockField(resolvedField);
  } else {
    return mockPropertyValue;
  }
}

function mockScalar(type: string, fieldName: string): any {
  switch (type) {
  case 'string':
    return interpretMockViaFieldName(fieldName);
  case 'number':
    return 10;
  case 'bool':
    return true;
  case 'int32':
    return 10;
  case 'int64':
    return 20;
  case 'unit32':
    return 100;
  case 'unit64':
    return 100;
  case 'sint32':
    return 100;
  case 'sint64':
    return 1200;
  case 'fixed32':
    return 1400;
  case 'fixed64':
    return 1500;
  case 'sfixed32':
    return 1600;
  case 'sfixed64':
    return 1700;
  case 'double':
    return 1.4;
  case 'float':
    return 1.1;
  case 'bytes':
    return new Buffer('Hello');
  default:
    return null;
  }
}

/**
 * Tries to guess a mock value from the field name.
 * Default Hello.
 */
function interpretMockViaFieldName(fieldName: string): string {
  const fieldNameLower = fieldName.toLowerCase();

  if (fieldNameLower.startsWith('id') || fieldNameLower.endsWith('id')) {
    return uuid.v4();
  }

  return 'Hello';
}
