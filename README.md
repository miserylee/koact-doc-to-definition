# koact-doc-to-definition

##  ![NPM version](https://img.shields.io/npm/v/koact-doc-to-definition.svg?style=flat)

# 怎么使用？

使用`npm`或`yarn`全局安装`koa-doc-to-definition`

在项目根目录下创建配置文件`koact-api-generator.config.json`：

```json
{
  "url": "http://localhost:3000",
  "destination": "./apis"
}
```

```typescript
// 配置文件数据结构
export interface IOptions {
  url: string; // 使用了`koact`作为路由组件的`koa`服务器地址;
  destination: string; // 希望API文件存放的文件夹地址;
  docSecret?: string; // koact doc密钥（如果服务端设置了）;
  target?: 'axios' | 'msio'; // 要生成的接口文件类型;
  pattern?: string | string[]; // 接口过滤规则
}
```

接口过滤规则的配置参考[multimatch](https://github.com/sindresorhus/multimatch)。

在项目目录下执行`koact-doc-to-definition`指令即可。

可使用`--config [config-file-path]`来指定配置文件的地址，默认为`koact-api-generator.config.json`。
